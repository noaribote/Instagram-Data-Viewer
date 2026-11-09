function getPythonCommand() {
  if (process.env.PYTHON) return process.env.PYTHON;
  return process.platform === "win32" ? "python" : "python3";
}

module.exports = { getPythonCommand };
