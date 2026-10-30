function formatGigabytes(bytes) {
    const gigabytes = bytes / (1024 ** 3);
    if (gigabytes < 0.10) return `${(bytes / (1024 ** 2)).toFixed(2).replace('.', ',')} Mo`;
    return `${gigabytes.toFixed(2).replace('.', ',')} Go`;
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} o`;
    const units = ['Ko', 'Mo', 'Go', 'To'];
    let size = bytes / 1024;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
    return `${size.toFixed(1)} ${units[unit]}`;
}

function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return 'calcul en cours';
    const value = Math.max(0, Math.ceil(seconds));
    if (value < 60) return `${value} s`;
    if (value < 3600) return `${Math.floor(value / 60)} min ${value % 60} s`;
    return `${Math.floor(value / 3600)} h ${Math.floor(value % 3600 / 60)} min`;
}

window.AppDom = { formatGigabytes, formatBytes, formatDuration };
