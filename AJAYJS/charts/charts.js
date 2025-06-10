let _chartCoreInitiated = false;
const _loadedScripts = new Set();
const _registeredPlugins = new Map();

export class _Chart {
    static registerPlugin(plugin) {
        if (!_registeredPlugins.has(plugin.name)) {
            _registeredPlugins.set(plugin.name, { globalRegister: true, ...plugin });

            if (window.Chart && _chartCoreInitiated) {
                Chart._loadScript(plugin.src)
                    .then(() => {
                        let pluginToRegister = null;
                        if (window.Chart.plugins && window.Chart.plugins.getAll) {
                            pluginToRegister = window.Chart.plugins.getAll().find(p => p.id === plugin.name || p.id === `${plugin.name}Plugin`);
                        }
                        if (!pluginToRegister && window[plugin.name]) {
                            pluginToRegister = window[plugin.name];
                        }

                        if (pluginToRegister) {
                            window.Chart.register(pluginToRegister);
                        }
                    })
                    .catch(error => console.error(`Failed to load plugin script for '${plugin.name}': ${error.message}`));
            }
        }
    }

    static _loadScript(src) {
        if (_loadedScripts.has(src)) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = () => {
                _loadedScripts.add(src);
                resolve();
            };
            s.onerror = () => {
                reject(new Error(`Failed to load script: ${src}`));
            };
            document.head.appendChild(s);
        });
    }

    constructor(canvasElement, initialConfig = {}) {
        if (!(canvasElement instanceof HTMLCanvasElement)) {
            throw new Error("`Chart` requires a valid <canvas> element.");
        }
        this._canvas = canvasElement;
        this._ctx = this._canvas.getContext('2d');
        this._chartInstance = null;

        this._canvas.setAttribute('role', 'img');
        if (initialConfig.ariaLabel) {
            this._canvas.setAttribute('aria-label', initialConfig.ariaLabel);
        }

        if (!_chartCoreInitiated) {
            const coreChartJsUrl = 'https://cdn.jsdelivr.net/npm/chart.js';
            Chart._loadScript(coreChartJsUrl)
                .then(() => {
                    _chartCoreInitiated = true;
                    const pluginLoadPromises = [];
                    _registeredPlugins.forEach(plugin => {
                        pluginLoadPromises.push(Chart._loadScript(plugin.src).then(() => {
                            if (plugin.globalRegister && window.Chart && typeof window.Chart.register === 'function') {
                                let pluginToRegister = null;
                                if (window.Chart.plugins && window.Chart.plugins.getAll) {
                                    pluginToRegister = window.Chart.plugins.getAll().find(p => p.id === plugin.name || p.id === `${plugin.name}Plugin`);
                                }
                                if (!pluginToRegister && window[plugin.name]) {
                                    pluginToRegister = window[plugin.name];
                                }

                                if (pluginToRegister) {
                                    window.Chart.register(pluginToRegister);
                                }
                            }
                        }).catch(error => console.error(`Failed to load and register plugin '${plugin.name}': ${error.message}`)));
                    });
                    return Promise.allSettled(pluginLoadPromises);
                })
                .catch(error => console.error(`Initial Chart.js setup failed: ${error.message}`));
        }

        this._config = {
            type: initialConfig.type ?? 'line',
            labels: Array.isArray(initialConfig.labels) ? initialConfig.labels : [],
            datasets: Array.isArray(initialConfig.datasets) ? initialConfig.datasets : [],
            titleText: typeof initialConfig.titleText === 'string' ? initialConfig.titleText : '',
            theme: initialConfig.theme === 'light' ? 'light' : 'dark',
            palette: Array.isArray(initialConfig.palette) ? initialConfig.palette : [],
            options: typeof initialConfig.options === 'object' ? initialConfig.options : {},
            onClick: typeof initialConfig.onClick === 'function' ? initialConfig.onClick : null,
            onHover: typeof initialConfig.onHover === 'function' ? initialConfig.onHover : null,
            enableDataLabels: typeof initialConfig.enableDataLabels === 'boolean' ? initialConfig.enableDataLabels : false,
            tooltipCallbacks: typeof initialConfig.tooltipCallbacks === 'object' ? initialConfig.tooltipCallbacks : {},
            legendCallbacks: typeof initialConfig.legendCallbacks === 'object' ? initialConfig.legendCallbacks : {},
            ariaLabel: typeof initialConfig.ariaLabel === 'string' ? initialConfig.ariaLabel : '',
        };

        this._resizeObserver = new ResizeObserver(() => {
            if (this._chartInstance) {
                this._chartInstance.resize();
            }
        });
        this._resizeObserver.observe(this._canvas.parentElement || this._canvas);
    }

    Render() {
        const waitForChartAndPlugins = () => {
            const allRequiredPluginsLoaded = Array.from(_registeredPlugins.values()).every(plugin =>
                _loadedScripts.has(plugin.src) &&
                (!plugin.globalRegister || (window.Chart && window.Chart.registry && window.Chart.registry.getControllers().has(plugin.name)) ||
                    (window.Chart && window.Chart.plugins && window.Chart.plugins.get(plugin.name)))
            );

            if (window.Chart && _chartCoreInitiated && allRequiredPluginsLoaded) {
                this._buildAndRender();
            } else {
                setTimeout(waitForChartAndPlugins, 50);
            }
        };
        waitForChartAndPlugins();
    }

    _buildAndRender() {
        const ChartJS = window.Chart;
        const cfg = this._config;
        const lowerType = cfg.type.toLowerCase();

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
            case 'ohlc':
                effectiveType = 'candlestick';
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
        }

        if (['matrix', 'treemap', 'candlestick', 'funnel', 'boxplot'].includes(effectiveType)) {
            let pluginRegistered = false;
            if (ChartJS.registry && typeof ChartJS.registry.getControllers === 'function') {
                pluginRegistered = ChartJS.registry.getControllers().has(effectiveType);
            }
            if (!pluginRegistered && ChartJS.plugins && typeof ChartJS.plugins.get === 'function') {
                pluginRegistered = !!ChartJS.plugins.get(effectiveType);
            }

            if (!pluginRegistered) {
                effectiveType = 'bar';
            }
        }

        const palette =
            Array.isArray(cfg.palette) && cfg.palette.length
                ? cfg.palette
                : this._generatePalette(cfg.datasets.length, cfg.theme);

        const mergedOptions = this._mergeThemeOptions(cfg.theme, cfg.titleText, cfg.options, lowerType);

        if (cfg.onClick) mergedOptions.onClick = cfg.onClick;
        if (cfg.onHover) mergedOptions.onHover = cfg.onHover;

        const normalizedDatasets = cfg.datasets.map((ds, i) => {
            return this._normalizeDataset(ds, palette[i % palette.length], lowerType);
        });

        const finalLabels = this._prepareLabels(cfg.labels, lowerType, normalizedDatasets);

        const chartConfig = {
            type: effectiveType,
            data: {
                labels: finalLabels,
                datasets: normalizedDatasets
            },
            options: mergedOptions
        };

        if (this._chartInstance) {
            this._chartInstance.destroy();
        }

        this._chartInstance = new ChartJS(this._ctx, chartConfig);

        if (this._config.ariaLabel) {
            this._canvas.setAttribute('aria-label', this._config.ariaLabel);
        }
    }

    addDataset(newDs) {
        this._config.datasets.push(newDs);
        this.Render();
    }

    removeDataset(index) {
        if (index >= 0 && index < this._config.datasets.length) {
            this._config.datasets.splice(index, 1);
            this.Render();
        }
    }

    updateData(dsIndex, newData) {
        if (this._config.datasets[dsIndex]) {
            this._config.datasets[dsIndex].data = Array.isArray(newData) ? newData : [];
            this.Render();
        }
    }

    updateLabels(newLabels) {
        if (Array.isArray(newLabels)) {
            this._config.labels = newLabels;
            this.Render();
        }
    }

    toggleTheme() {
        this._config.theme = this._config.theme === 'dark' ? 'light' : 'dark';
        this.Render();
    }

    updateType(newType) {
        this._config.type = newType;
        this.Render();
    }

    updateTitle(newTitleText) {
        this._config.titleText = newTitleText;
        this.Render();
    }

    updateAriaLabel(newAriaLabel) {
        this._config.ariaLabel = newAriaLabel;
        this._canvas.setAttribute('aria-label', newAriaLabel);
    }

    destroy() {
        if (this._chartInstance) {
            this._chartInstance.destroy();
            this._chartInstance = null;
        }
        this._resizeObserver.disconnect();
    }

    _normalizeDataset(ds, defaultColor, lowerType) {
        const base = {
            label: ds.label ?? '',
            data: Array.isArray(ds.data) ? ds.data : [],
            backgroundColor: ds.backgroundColor ?? defaultColor,
            borderColor: ds.borderColor ?? defaultColor,
            borderWidth: typeof ds.borderWidth === 'number' ? ds.borderWidth : 2,
            ...(ds.additionalProps ?? {})
        };

        switch (lowerType) {
            case 'line':
            case 'scatter':
            case 'radar':
                base.pointRadius = typeof ds.pointRadius === 'number' ? ds.pointRadius : 4;
                base.fill = typeof ds.fill === 'boolean' ? ds.fill : false;
                base.tension = typeof ds.tension === 'number' ? ds.tension : 0.4;
                break;
            case 'area':
                base.pointRadius = typeof ds.pointRadius === 'number' ? ds.pointRadius : 4;
                base.fill = typeof ds.fill === 'boolean' ? ds.fill : true;
                base.tension = typeof ds.tension === 'number' ? ds.tension : 0.4;
                break;
            case 'pie':
            case 'doughnut':
            case 'polararea':
                base.backgroundColor = Array.isArray(ds.backgroundColor) ? ds.backgroundColor : [defaultColor];
                base.hoverOffset = typeof ds.hoverOffset === 'number' ? ds.hoverOffset : 4;
                base.borderWidth = typeof ds.borderWidth === 'number' ? ds.borderWidth : 2;
                break;
            case 'bubble':
                base.radius = typeof ds.radius === 'number' || Array.isArray(ds.radius) ? ds.radius : 5;
                break;
            case 'histogram':
                return this._buildHistogramDataset(ds, defaultColor);
            case 'candlestick':
            case 'ohlc':
                return {
                    label: ds.label ?? 'OHLC',
                    data: base.data,
                    rising: { color: ds.risingColor ?? '#26a69a' },
                    falling: { color: ds.fallingColor ?? '#ef5350' },
                    neutral: { color: ds.neutralColor ?? '#999999' },
                    ...(ds.additionalProps ?? {})
                };
            case 'heatmap':
                return {
                    label: ds.label ?? 'Heatmap',
                    data: base.data,
                    backgroundColor: ds.backgroundColor ?? defaultColor,
                    borderColor: ds.borderColor ?? defaultColor,
                    borderWidth: typeof ds.borderWidth === 'number' ? ds.borderWidth : 1,
                    ...(ds.additionalProps ?? {})
                };
            case 'treemap':
                return {
                    label: ds.label ?? 'Treemap',
                    data: base.data,
                    key: ds.key ?? 'value',
                    groups: Array.isArray(ds.groups) ? ds.groups : [],
                    backgroundColor: base.backgroundColor,
                    spacing: typeof ds.spacing === 'number' ? ds.spacing : 2,
                    fontColor: ds.fontColor ?? (this._config.theme === 'light' ? '#000000' : '#ffffff'),
                    ...(ds.additionalProps ?? {})
                };
            case 'boxplot':
                return {
                    label: ds.label ?? 'Boxplot',
                    data: base.data,
                    padding: typeof ds.padding === 'number' ? ds.padding : 10,
                    itemRadius: typeof ds.itemRadius === 'number' ? ds.itemRadius : 2,
                    outlierColor: ds.outlierColor ?? '#777777',
                    itemStyle: ds.itemStyle ?? 'circle',
                    ...(ds.additionalProps ?? {})
                };
            case 'gauge':
                const gaugeData = Array.isArray(ds.data) && ds.data.length >= 1
                    ? [ds.data[0], Math.max(0, (ds.data[1] ?? 100) - ds.data[0])]
                    : [0, 100];
                return {
                    label: ds.label ?? 'Gauge',
                    data: gaugeData,
                    backgroundColor: ds.backgroundColor ?? [defaultColor, '#e0e0e0'],
                    borderWidth: 0,
                    circumference: typeof ds.circumference === 'number' ? ds.circumference : 180,
                    rotation: typeof ds.rotation === 'number' ? ds.rotation : -90,
                    cutout: ds.cutout ?? '80%',
                    ...(ds.additionalProps ?? {})
                };
            case 'funnel':
            case 'sankey':
            case 'chord':
                break;
            default:
                break;
        }
        return base;
    }

    _prepareLabels(labels, lowerType, datasets) {
        if (lowerType === 'histogram') {
            return datasets[0]?.data.map(item => item.x) ?? [];
        }
        return labels;
    }

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

    _mergeThemeOptions(theme, titleText, userOpts, chartType) {
        const isLight = theme === 'light';
        const gridColor = isLight ? 'rgba(224, 224, 224, 0.7)' : 'rgba(51, 51, 51, 0.7)';
        const tickColor = isLight ? '#333333' : '#dddddd';
        const bgColor = isLight ? '#ffffff' : '#1e1e2f';
        const textColor = isLight ? '#222222' : '#ffffff';
        const axisLabelColor = isLight ? '#555555' : '#aaaaaa';

        const defaultOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 700 },
            plugins: {
                title: {
                    display: !!titleText,
                    text: titleText,
                    color: textColor,
                    font: { size: 20, weight: '500', family: 'Arial, sans-serif' },
                    padding: { top: 12, bottom: 20 }
                },
                legend: {
                    display: true,
                    labels: {
                        color: textColor,
                        font: { size: 13, family: 'Arial, sans-serif' },
                        ...(userOpts.legendCallbacks ?? {})
                    }
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(50,50,60,0.9)',
                    titleColor: textColor,
                    bodyColor: textColor,
                    borderColor: isLight ? '#ccc' : '#444',
                    borderWidth: 1,
                    cornerRadius: 4,
                    displayColors: true,
                    callbacks: {
                        title: (tooltipItems) => {
                            if (tooltipItems.length > 0) {
                                return tooltipItems[0].label || tooltipItems[0].chart.data.labels[tooltipItems[0].dataIndex];
                            }
                            return '';
                        },
                        label: (tooltipItem) => {
                            const datasetLabel = tooltipItem.dataset.label ? `${tooltipItem.dataset.label}: ` : '';
                            return `${datasetLabel}${tooltipItem.formattedValue}`;
                        },
                        ...(userOpts.tooltipCallbacks ?? {})
                    },
                    titleFont: { size: 14, family: 'Arial, sans-serif' },
                    bodyFont: { size: 12, family: 'Arial, sans-serif' }
                },
                datalabels: {
                    display: userOpts.enableDataLabels ?? (userOpts.plugins?.datalabels?.display ?? false),
                    color: userOpts.plugins?.datalabels?.color ?? textColor,
                    font: { size: userOpts.plugins?.datalabels?.font?.size ?? 12, family: 'Arial, sans-serif' },
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
                    ticks: { color: tickColor, font: { size: 12, family: 'Arial, sans-serif' } },
                    grid: { color: gridColor, borderColor: gridColor },
                    title: {
                        display: userOpts.scales?.x?.title?.display ?? false,
                        text: userOpts.scales?.x?.title?.text ?? '',
                        color: axisLabelColor,
                        font: { size: 14, family: 'Arial, sans-serif' }
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: tickColor, font: { size: 12, family: 'Arial, sans-serif' } },
                    grid: { color: gridColor, borderColor: gridColor },
                    title: {
                        display: userOpts.scales?.y?.title?.display ?? false,
                        text: userOpts.scales?.y?.title?.text ?? '',
                        color: axisLabelColor,
                        font: { size: 14, family: 'Arial, sans-serif' }
                    }
                }
            },
            backgroundColor: bgColor,
            font: {
                family: 'Arial, sans-serif',
                size: 12,
                color: textColor
            }
        };

        if (chartType === 'gauge') {
            defaultOptions.scales = {
                x: { display: false },
                y: { display: false }
            };
            defaultOptions.plugins.tooltip.enabled = false;
            defaultOptions.plugins.legend.display = false;
            defaultOptions.cutout = '80%';
            defaultOptions.circumference = 180;
            defaultOptions.rotation = -90;
        } else if (['pie', 'doughnut', 'polararea'].includes(chartType)) {
            defaultOptions.scales = {};
        }

        return this._deepMerge(defaultOptions, userOpts);
    }

    _buildHistogramDataset(ds, defaultColor) {
        const rawValues = Array.isArray(ds.data) ? ds.data.filter(v => typeof v === 'number' && !isNaN(v)) : [];
        if (!rawValues.length) {
            return { label: ds.label ?? 'Histogram', data: [], backgroundColor: defaultColor };
        }

        const minVal = Math.min(...rawValues);
        const maxVal = Math.max(...rawValues);
        const binCount = typeof ds.bins === 'number' && ds.bins > 0 ? ds.bins : 10;

        let edges = [];
        if (Array.isArray(ds.binEdges) && ds.binEdges.length >= 2) {
            edges = ds.binEdges.slice().sort((a, b) => a - b);
            if (minVal < edges[0]) edges.unshift(minVal);
            if (maxVal > edges[edges.length - 1]) edges.push(maxVal);
        } else {
            const binWidth = (maxVal - minVal) / binCount;
            for (let i = 0; i <= binCount; i++) {
                edges.push(minVal + i * binWidth);
            }
            if (edges[edges.length - 1] < maxVal) {
                edges[edges.length - 1] = maxVal;
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
            const label = `${edges[i].toFixed(2)} - ${edges[i + 1].toFixed(2)}`;
            return { x: label, y: count };
        });

        return {
            label: ds.label ?? 'Histogram',
            data: dataArray,
            backgroundColor: ds.backgroundColor ?? defaultColor,
            borderColor: ds.borderColor ?? defaultColor,
            borderWidth: typeof ds.borderWidth === 'number' ? ds.borderWidth : 1,
            barPercentage: 1.0,
            categoryPercentage: 1.0,
            ...(ds.additionalProps ?? {})
        };
    }
}
