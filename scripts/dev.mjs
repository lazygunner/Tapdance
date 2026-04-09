import { spawn } from 'node:child_process';

const children = [];

function startProcess(command, args, name) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`${name} exited with signal ${signal}`);
    } else if (code && code !== 0) {
      console.log(`${name} exited with code ${code}`);
      process.exitCode = code;
      shutdown();
    }
  });

  children.push(child);
}

function shutdown() {
  while (children.length > 0) {
    const child = children.pop();
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

startProcess('npm', ['run', 'dev:bridge:watch'], 'Seedance bridge');
startProcess('npm', ['run', 'dev:web'], 'Vite');
