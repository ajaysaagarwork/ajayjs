/**
 * @typedef {'line' | 'bar' | 'scatter' | 'pie' | 'doughnut' | 'area' | 'bubble'
 *   | 'radar' | 'polarArea' | 'heatmap' | 'treemap' | 'candlestick'
 *   | 'gauge' | 'funnel' | 'boxplot' | 'histogram'} ChartType
 */

/**
 * @typedef {Object} DatasetConfig
 * @property {string} [label]
 * @property {Array<number>|Array<object>} [data]
 * @property {string|string[]} [backgroundColor]
 * @property {string|string[]} [borderColor]
 * @property {number} [borderWidth]
 * @property {number} [pointRadius]
 * @property {boolean} [fill]
 * @property {number} [tension]
 * @property {number} [bins]                  // for histogram: number of bins
 * @property {Array<number>} [binEdges]       // for histogram: explicit bin edges
 * @property {string} [key]                   // for treemap: value key
 * @property {Array<string>} [groups]         // for treemap: group hierarchy
 * @property {string} [risingColor]           // for candlestick
 * @property {string} [fallingColor]          // for candlestick
 * @property {number} [padding]               // for boxplot
 * @property {number} [itemRadius]            // for boxplot
 * @property {string} [outlierColor]          // for boxplot
 * @property {object} [additionalProps]
 */

/**
 * @typedef {Object} ChartRenderOptions
 * @property {ChartType} [type]                // default 'line'
 * @property {string[]} [labels]               // X-axis labels
 * @property {DatasetConfig[]} [datasets]      // array of datasets
 * @property {string} [titleText]              // chart title
 * @property {'dark' | 'light'} [theme]        // default 'dark'
 * @property {string[]} [palette]              // explicit color array
 * @property {object} [options]                // any Chart.js options to merge
 * @property {function} [onClick]              // click handler: (evt, elements) => {}
 * @property {function} [onHover]              // hover handler: (evt, elements) => {}
 */

let _chartInitiated = false;

export class _Chart {
    /**
     * @param {HTMLCanvasElement} canvasElement
     * @param {ChartRenderOptions} [initialConfig={}]
     */
    constructor(canvasElement, initialConfig = {}) {
        if (!(canvasElement instanceof HTMLCanvasElement)) {
            throw new Error("`_Chart` requires a valid <canvas> element.");
        }
        this._canvas = canvasElement;
        this._ctx = this._canvas.getContext('2d');
        this._chartInstance = null;

        // 1️⃣ Lazy-load Chart.js + plugins once
        if (!_chartInitiated) {
            const scripts = [
                'https://cdn.jsdelivr.net/npm/chart.js',
                //'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2/dist/chartjs-plugin-datalabels.min.js',
                //'https://cdn.jsdelivr.net/npm/chartjs-chart-matrix@1.3.0/dist/chartjs-chart-matrix.js',
                //'https://cdn.jsdelivr.net/npm/chartjs-chart-treemap@3/build/Chart.Treemap.js',
                //'https://cdn.jsdelivr.net/npm/chartjs-chart-financial@3/build/chartjs-chart-financial.min.js',
                //'https://cdn.jsdelivr.net/npm/chartjs-plugin-funnel@1/build/Chart.Funnel.min.js',
                //'https://cdn.jsdelivr.net/npm/chartjs-chart-boxplot@4/build/chartjs-chart-boxplot.min.js'
            ];
            let loadedCount = 0;
            scripts.forEach(src => {
                const s = document.createElement('script');
                s.src = src;
                s.async = false; // preserve order
                s.onload = () => {
                    loadedCount++;
                    if (loadedCount === scripts.length) {
                        _chartInitiated = true;
                        console.log('AJAYJS >>> CHARTS INITIALIZED...');
                    }
                };
                s.onerror = () => {
                    console.error(`Failed to load script: ${src}`);
                };
                document.head.appendChild(s);
            });
        }

        // 2️⃣ Store config values (merge with defaults)
        this._config = {
            type: initialConfig.type ?? 'line',
            labels: Array.isArray(initialConfig.labels) ? initialConfig.labels : [],
            datasets: Array.isArray(initialConfig.datasets) ? initialConfig.datasets : [],
            titleText: typeof initialConfig.titleText === 'string' ? initialConfig.titleText : '',
            theme: initialConfig.theme === 'light' ? 'light' : 'dark',
            palette: Array.isArray(initialConfig.palette) ? initialConfig.palette : [],
            options: typeof initialConfig.options === 'object' ? initialConfig.options : {},
            onClick: typeof initialConfig.onClick === 'function' ? initialConfig.onClick : null,
            onHover: typeof initialConfig.onHover === 'function' ? initialConfig.onHover : null
        };

        // 3️⃣ Responsive: re-draw when window resizes
        this._resizeObserver = new ResizeObserver(() => {
            if (this._chartInstance) {
                this._chartInstance.resize();
            }
        });
        this._resizeObserver.observe(this._canvas.parentElement || this._canvas);
    }

    /**
     * Call this to render (or re-render) the chart using stored config.
     */
    Render() {
        const waitForChartAndPlugins = () => {
            if (window.Chart) {
                this._buildAndRender();
            } else {
                setTimeout(waitForChartAndPlugins, 20);
            }
        };
        waitForChartAndPlugins();
    }

    // ─── PRIVATE: build config, destroy prior chart, render new ───────────────────
    _buildAndRender() {
        const ChartJS = window.Chart;
        const cfg = this._config;
        const lowerType = cfg.type.toLowerCase();

        // 1. Map extended types to Chart.js internal types
        let effectiveType = cfg.type;
        switch (lowerType) {
            case 'area':
                effectiveType = 'line';
                break;
            case 'heatmap':
                effectiveType = 'matrix';
                break;
            case 'treemap':
                effectiveType = 'treemap';
                break;
            case 'candlestick':
                effectiveType = 'candlestick';
                break;
            case 'ohlc':
                effectiveType = 'ohlc';
                break;
            case 'gauge':
                effectiveType = 'doughnut';
                break;
            case 'funnel':
                effectiveType = 'funnel';
                break;
            case 'boxplot':
                effectiveType = 'boxplot';
                break;
            case 'histogram':
                effectiveType = 'bar';
                break;
            // core types remain unchanged
        }

        // 2. Determine color palette
        const palette =
            Array.isArray(cfg.palette) && cfg.palette.length
                ? cfg.palette
                : this._generatePalette(cfg.datasets.length, cfg.theme);

        // 3. Merge default theme options with user options
        const mergedOptions = this._mergeThemeOptions(cfg.theme, cfg.titleText, cfg.options);

        // 4. Attach event handlers if provided
        if (cfg.onClick) mergedOptions.onClick = cfg.onClick;
        if (cfg.onHover) mergedOptions.onHover = cfg.onHover;

        // 5. Normalize datasets (auto-color if missing, handle extended types)
        const normalizedDatasets = cfg.datasets.map((ds, i) => {
            // If histogram, build bins
            if (lowerType === 'histogram') {
                return this._buildHistogramDataset(ds, palette[i]);
            }
            // If area, enforce fill
            if (lowerType === 'area') {
                ds.fill = true;
            }
            // If gauge, hack via doughnut
            if (lowerType === 'gauge') {
                ds.backgroundColor = ds.backgroundColor ?? [palette[i], '#e0e0e0'];
                ds.hoverOffset = ds.hoverOffset ?? 0;
                ds.borderWidth = 0;
            }
            return this._normalizeDataset(ds, palette[i], lowerType);
        });

        // 6. Prepare labels (histogram uses data.x)
        const finalLabels = this._prepareLabels(cfg.labels, lowerType, normalizedDatasets);

        // 7. Final Chart.js config
        const chartConfig = {
            type: effectiveType,
            data: {
                labels: finalLabels,
                datasets: normalizedDatasets
            },
            options: mergedOptions
        };

        // 8. Destroy existing instance
        if (this._chartInstance) {
            this._chartInstance.destroy();
        }

        // 9. Render new Chart.js instance
        this._chartInstance = new ChartJS(this._ctx, chartConfig);
    }

    // ─── PUBLIC: dynamic updates ─────────────────────────────────────────────────────

    /**
     * Add a new dataset and re-render.
     * @param {DatasetConfig} newDs
     */
    addDataset(newDs) {
        this._config.datasets.push(newDs);
        this.Render();
    }

    /**
     * Remove dataset at specified index and re-render.
     * @param {number} index
     */
    removeDataset(index) {
        if (index >= 0 && index < this._config.datasets.length) {
            this._config.datasets.splice(index, 1);
            this.Render();
        }
    }

    /**
     * Update data array of a specific dataset index and re-render.
     * @param {number} dsIndex
     * @param {Array<number>|Array<object>} newData
     */
    updateData(dsIndex, newData) {
        if (this._config.datasets[dsIndex]) {
            this._config.datasets[dsIndex].data = Array.isArray(newData) ? newData : [];
            this.Render();
        }
    }

    /**
     * Replace all labels and re-render.
     * @param {string[]} newLabels
     */
    updateLabels(newLabels) {
        if (Array.isArray(newLabels)) {
            this._config.labels = newLabels;
            this.Render();
        }
    }

    /**
     * Toggle between 'dark' and 'light' themes and re-render.
     */
    toggleTheme() {
        this._config.theme = this._config.theme === 'dark' ? 'light' : 'dark';
        this.Render();
    }

    /**
     * Destroy chart and stop observing for resize.
     */
    destroy() {
        if (this._chartInstance) {
            this._chartInstance.destroy();
            this._chartInstance = null;
        }
        this._resizeObserver.disconnect();
    }

    // ─── PRIVATE HELPERS ─────────────────────────────────────────────────────────────

    /**
     * Normalize one DatasetConfig → Chart.js dataset object.
     * @param {DatasetConfig} ds
     * @param {string} defaultColor
     * @param {string} lowerType
     */
    _normalizeDataset(ds, defaultColor, lowerType) {
        const base = {
            label: ds.label ?? '',
            data: Array.isArray(ds.data) ? ds.data : [],
            backgroundColor: ds.backgroundColor ?? defaultColor,
            borderColor: ds.borderColor ?? defaultColor,
            borderWidth: typeof ds.borderWidth === 'number' ? ds.borderWidth : 2,
            pointRadius: typeof ds.pointRadius === 'number' ? ds.pointRadius : 4,
            fill: typeof ds.fill === 'boolean' ? ds.fill : false,
            tension: typeof ds.tension === 'number' ? ds.tension : 0.4,
            ...(ds.additionalProps ?? {})
        };

        if (lowerType === 'histogram') {
            return {
                label: ds.label ?? 'Histogram',
                data: base.data,
                backgroundColor: ds.backgroundColor ?? defaultColor,
                borderColor: ds.borderColor ?? defaultColor,
                borderWidth: base.borderWidth,
                ...(ds.additionalProps ?? {})
            };
        }

        if (['candlestick', 'ohlc'].includes(lowerType)) {
            return {
                label: ds.label ?? 'OHLC',
                data: base.data,
                rising: { color: ds.risingColor ?? '#26a69a' },
                falling: { color: ds.fallingColor ?? '#ef5350' },
                ...(ds.additionalProps ?? {})
            };
        }

        if (lowerType === 'heatmap') {
            return {
                label: ds.label ?? 'Heatmap',
                data: base.data,
                backgroundColor: ({ dataIndex }) =>
                    Array.isArray(ds.backgroundColor)
                        ? ds.backgroundColor[dataIndex % ds.backgroundColor.length]
                        : defaultColor,
                borderWidth: typeof ds.borderWidth === 'number' ? ds.borderWidth : 1,
                ...(ds.additionalProps ?? {})
            };
        }

        if (lowerType === 'treemap') {
            return {
                label: ds.label ?? 'Treemap',
                data: base.data,
                key: ds.key ?? 'value',
                groups: Array.isArray(ds.groups) ? ds.groups : [],
                backgroundColor: base.backgroundColor,
                ...(ds.additionalProps ?? {})
            };
        }

        if (lowerType === 'boxplot') {
            return {
                label: ds.label ?? 'Boxplot',
                data: base.data,
                padding: typeof ds.padding === 'number' ? ds.padding : 10,
                itemRadius: typeof ds.itemRadius === 'number' ? ds.itemRadius : 2,
                outlierColor: ds.outlierColor ?? '#777',
                ...(ds.additionalProps ?? {})
            };
        }

        return base;
    }

    /**
     * Prepare labels array depending on chart type:
     *   • histogram: pull `x` from each data point
     *   • others: use user-supplied labels as-is
     */
    _prepareLabels(labels, lowerType, datasets) {
        if (lowerType === 'histogram') {
            return datasets[0]?.data.map(item => item.x) ?? [];
        }
        return labels;
    }

    /**
     * Return a default palette of `n` colors based on theme.
     * @param {number} n
     * @param {'dark'|'light'} theme
     */
    _generatePalette(n, theme) {
        const lightPalette = [
            '#e63946', '#f1faee', '#a8dadc', '#457b9d', '#1d3557',
            '#ffb703', '#fb8500', '#023047', '#8ecae6', '#219ebc'
        ];
        const darkPalette = [
            '#ff4d4d', '#ffaa4d', '#4dff88', '#4d94ff', '#c44dff',
            '#ff4dc4', '#4dffef', '#ffd24d', '#8aff4d', '#ff8f4d'
        ];
        const base = theme === 'light' ? lightPalette : darkPalette;
        return Array.from({ length: n }, (_, i) => base[i % base.length]);
    }

    /**
     * Deep‐merge two plain objects (source → target).
     * @param {object} target
     * @param {object} source
     */
    _deepMerge(target, source) {
        const out = { ...target };
        for (const key in source) {
            if (
                source[key] !== null &&
                typeof source[key] === 'object' &&
                !Array.isArray(source[key]) &&
                key in target &&
                typeof target[key] === 'object' &&
                !Array.isArray(target[key])
            ) {
                out[key] = this._deepMerge(target[key], source[key]);
            } else {
                out[key] = source[key];
            }
        }
        return out;
    }

    /**
     * Merge default theme options with user options.
     * @param {'dark'|'light'} theme
     * @param {string} titleText
     * @param {object} userOpts
     */
    _mergeThemeOptions(theme, titleText, userOpts) {
        const isLight = theme === 'light';
        const gridColor = isLight ? '#e0e0e0' : '#333333';
        const tickColor = isLight ? '#333333' : '#dddddd';
        const bgColor = isLight ? '#ffffff' : '#1e1e2f';
        const textColor = isLight ? '#222222' : '#ffffff';

        const defaultOptions = {
            responsive: true,
            animation: { duration: 700 },
            plugins: {
                title: {
                    display: !!titleText,
                    text: titleText,
                    color: textColor,
                    font: { size: 20, weight: '500' },
                    padding: { top: 12, bottom: 20 }
                },
                legend: {
                    labels: { color: textColor, font: { size: 13 } }
                },
                tooltip: {
                    backgroundColor: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(50,50,60,0.9)',
                    titleColor: textColor,
                    bodyColor: textColor,
                    borderColor: isLight ? '#ccc' : '#444',
                    borderWidth: 1
                },
                datalabels: {
                    display: userOpts.plugins?.datalabels?.display ?? false,
                    color: userOpts.plugins?.datalabels?.color ?? textColor,
                    font: { size: userOpts.plugins?.datalabels?.font?.size ?? 12 },
                    align: userOpts.plugins?.datalabels?.align ?? 'center',
                    anchor: userOpts.plugins?.datalabels?.anchor ?? 'center',
                    ...(userOpts.plugins?.datalabels ?? {})
                }
            },
            layout: {
                padding: { top: 10, right: 10, bottom: 10, left: 10 }
            },
            scales: {
                x: {
                    ticks: { color: tickColor, font: { size: 12 } },
                    grid: { color: gridColor, borderColor: gridColor }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: tickColor, font: { size: 12 } },
                    grid: { color: gridColor, borderColor: gridColor }
                }
            },
            backgroundColor: bgColor
        };

        return this._deepMerge(defaultOptions, userOpts);
    }

    /**
     * Build a histogram dataset from raw data values.
     * @param {DatasetConfig} ds
     * @param {string} defaultColor
     */
    _buildHistogramDataset(ds, defaultColor) {
        const rawValues = Array.isArray(ds.data) ? ds.data.filter(v => typeof v === 'number') : [];
        if (!rawValues.length) {
            return { label: ds.label ?? 'Histogram', data: [], backgroundColor: defaultColor };
        }

        const minVal = Math.min(...rawValues);
        const maxVal = Math.max(...rawValues);
        const binCount = typeof ds.bins === 'number' ? ds.bins : 10;
        const binWidth = (maxVal - minVal) / binCount;

        let edges = [];
        if (Array.isArray(ds.binEdges) && ds.binEdges.length >= 2) {
            edges = ds.binEdges.slice().sort((a, b) => a - b);
        } else {
            for (let i = 0; i <= binCount; i++) {
                edges.push(minVal + i * binWidth);
            }
        }

        const freq = new Array(edges.length - 1).fill(0);
        rawValues.forEach(val => {
            for (let i = 0; i < edges.length - 1; i++) {
                if (val >= edges[i] && val < edges[i + 1]) {
                    freq[i]++;
                    return;
                }
                if (i === edges.length - 2 && val === edges[i + 1]) {
                    freq[i]++;
                }
            }
        });

        const dataArray = freq.map((count, i) => {
            const label = `${edges[i].toFixed(2)} – ${edges[i + 1].toFixed(2)}`;
            return { x: label, y: count };
        });

        return {
            label: ds.label ?? 'Histogram',
            data: dataArray,
            backgroundColor: ds.backgroundColor ?? defaultColor,
            borderColor: ds.borderColor ?? defaultColor,
            borderWidth: typeof ds.borderWidth === 'number' ? ds.borderWidth : 1,
            ...(ds.additionalProps ?? {})
        };
    }
}
