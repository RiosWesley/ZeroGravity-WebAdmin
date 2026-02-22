import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const CONTAINER_NAME = 'zerogravity';

// Helper for finding the zerogravity container
export async function getZGContainer() {
  const containers = await docker.listContainers({ all: true });
  const zgContainerInfo = containers.find(c =>
    c.Names.some(n => n === `/${CONTAINER_NAME}`)
  );

  if (!zgContainerInfo) {
    throw new Error(`Container '${CONTAINER_NAME}' not found.`);
  }

  return docker.getContainer(zgContainerInfo.Id);
}

// Helper to execute commands in the container via docker exec
export async function execCommand(commandArray) {
  const container = await getZGContainer();

  const exec = await container.exec({
    Cmd: commandArray,
    AttachStdout: true,
    AttachStderr: true,
  });

  return new Promise((resolve, reject) => {
    exec.start({}, (err, stream) => {
      if (err) return reject(err);

      let output = '';
      let errorData = '';

      docker.modem.demuxStream(stream, {
        write: (data) => { output += data.toString('utf8'); }
      }, {
        write: (data) => { errorData += data.toString('utf8'); }
      });

      stream.on('end', async () => {
        const inspectInfo = await exec.inspect();
        if (inspectInfo.ExitCode !== 0) {
          reject(new Error(errorData || 'Command failed with exit code ' + inspectInfo.ExitCode));
        } else {
          resolve(output.trim());
        }
      });
    });
  });
}

// API Functions
export async function getContainerStatus() {
  try {
    const container = await getZGContainer();
    const data = await container.inspect();
    return {
      id: data.Id,
      state: data.State.Status, // e.g. "running", "exited"
      created: data.Created,
      image: data.Config.Image,
      env: data.Config.Env,
    };
  } catch (error) {
    return { state: 'not_found', error: error.message };
  }
}

export async function restartContainer() {
  const container = await getZGContainer();
  await container.restart();
  return { success: true };
}

export async function stopContainer() {
  const container = await getZGContainer();
  await container.stop();
  return { success: true };
}

export async function startContainer() {
  const container = await getZGContainer();
  await container.start();
  return { success: true };
}

// ZeroGravity CLI specific helpers
export async function getAccounts() {
  try {
    // Attempt to list accounts using zg CLI
    const output = await execCommand(['zg', 'accounts']);
    return output;
  } catch (err) {
    return `Error fetching accounts: ${err.message}`;
  }
}

// Strip Docker multiplexed stream headers (8 bytes per frame)
// and ANSI escape codes from log output
function parseMuxedStream(buffer) {
  const lines = [];
  let offset = 0;

  while (offset + 8 <= buffer.length) {
    // Bytes 0: stream type (1=stdout, 2=stderr), Bytes 4-7: frame size
    const frameSize = buffer.readUInt32BE(offset + 4);
    offset += 8;

    if (frameSize === 0) continue;

    const frameEnd = Math.min(offset + frameSize, buffer.length);
    const chunk = buffer.slice(offset, frameEnd).toString('utf8');
    lines.push(chunk);
    offset += frameSize;
  }

  const raw = lines.join('');
  // Strip ANSI escape codes
  // eslint-disable-next-line no-control-regex
  return raw.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').replace(/\x1B\[\??\d+[a-zA-Z]/g, '');
}

export async function getLogs(tail = 100) {
  try {
    const container = await getZGContainer();
    const rawBuffer = await container.logs({ stdout: true, stderr: true, tail });
    return parseMuxedStream(rawBuffer);
  } catch (err) {
    return 'Error fetching logs: ' + err.message;
  }
}
