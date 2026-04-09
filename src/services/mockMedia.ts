function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function fallbackMockVideoUrl() {
  return URL.createObjectURL(new Blob([], { type: 'video/webm' }));
}

function drawMockFrame(context: CanvasRenderingContext2D, width: number, height: number, phase: number) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(0.5, '#1d4ed8');
  gradient.addColorStop(1, '#22c55e');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = 'rgba(255, 255, 255, 0.18)';
  context.fillRect(12 + phase * 4, 10, width - 24, height - 20);

  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(26 + phase * 6, height / 2, 10, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#e2e8f0';
  context.fillRect(44 + phase * 3, height / 2 - 8, width - 64, 16);
}

async function createMockVideoUrl() {
  if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') {
    return fallbackMockVideoUrl();
  }

  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  const context = canvas.getContext('2d');
  if (!context || typeof canvas.captureStream !== 'function') {
    return fallbackMockVideoUrl();
  }

  const mimeType = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ].find((candidate) => MediaRecorder.isTypeSupported(candidate)) || 'video/webm';
  const stream = canvas.captureStream(6);
  const chunks: BlobPart[] = [];

  const recordedBlob = new Promise<Blob>((resolve, reject) => {
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      resolve(new Blob([], { type: mimeType }));
      return;
    }

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });
    recorder.addEventListener('error', () => reject(new Error('Failed to create mock video.')));
    recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: mimeType })));
    recorder.start();

    void (async () => {
      for (let phase = 0; phase < 6; phase += 1) {
        drawMockFrame(context, canvas.width, canvas.height, phase);
        await wait(90);
      }
      recorder.stop();
    })();
  }).finally(() => {
    stream.getTracks().forEach((track) => track.stop());
  });

  try {
    const blob = await recordedBlob;
    return URL.createObjectURL(blob.size > 0 ? blob : new Blob([], { type: mimeType }));
  } catch {
    return fallbackMockVideoUrl();
  }
}

let mockVideoUrlPromise: Promise<string> | null = null;

export function getMockVideoUrl() {
  if (!mockVideoUrlPromise) {
    mockVideoUrlPromise = createMockVideoUrl();
  }
  return mockVideoUrlPromise;
}
