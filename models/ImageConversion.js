const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const isHeic = (filePath, contentType = "") =>
  /\.hei[cf]$/i.test(filePath) ||
  /image\/(?:hei[cf]|hei[cf]-sequence)/i.test(contentType);

function convertHeicToPng(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.tmp.png`;
    const child = spawn(
      "ffmpeg",
      ["-y", "-v", "error", "-i", inputPath, "-frames:v", "1", temporaryPath],
      { windowsHide: true },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 4000) stderr += chunk.toString();
    });
    child.once("error", (error) => reject(new Error(`Conversion HEIC impossible : ${error.message}`)));
    child.once("close", async (code) => {
      try {
        if (code !== 0) throw new Error(stderr.trim().split(/\r?\n/).at(-1) || "La photo HEIC ne peut pas être décodée.");
        await fs.promises.copyFile(temporaryPath, outputPath);
        await fs.promises.rm(temporaryPath, { force: true });
        resolve(outputPath);
      } catch (error) {
        await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
        reject(error);
      }
    });
  });
}

function pngPath(filePath) {
  return path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}.png`);
}

module.exports = { convertHeicToPng, isHeic, pngPath };
