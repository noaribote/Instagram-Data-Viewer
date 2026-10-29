const dropTarget = document.getElementById('drop-target');
const directoryOpen = document.getElementById("directory-open");

dropTarget.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropTarget.classList.add('drag-over');
});
dropTarget.addEventListener('dragleave', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropTarget.classList.remove('drag-over');
});
dropTarget.addEventListener('drop', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropTarget.classList.remove('drag-over');
    const items = [...event.dataTransfer.items];
    for (const item of items) {
        if (item.kind !== 'file') { continue; }
        const file = item.getAsFile();
        if (!file) { continue; }
        const result = await window.electronAPI.copyFolder(file);
        console.log(result);
    }
});

directoryOpen.addEventListener("click", (event) => {
    event.preventDefault();
    window.electronAPI.openDirectory(directoryOpen.datapath);
});