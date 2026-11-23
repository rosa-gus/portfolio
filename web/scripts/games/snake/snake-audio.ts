type Sound = "eat" | "death" | "witch";
const urls: Record<Sound, URL> = {
  eat: new URL("./audio/eat.mp3", import.meta.url),
  death: new URL("./audio/death.mp3", import.meta.url),
  witch: new URL("./audio/enemy.mp3", import.meta.url),
};

export const createSnakeAudio = () => {
  let context: AudioContext | null = null;
  let gain: GainNode | null = null;
  let muted = false;
  let generation = 0;
  const buffers = new Map<Sound, Promise<AudioBuffer | null>>();
  const playing = new Set<AudioBufferSourceNode>();

  // Called by the start/resume button or key, before any asynchronous work.
  const unlock = () => {
    if (muted) return;
    try {
      if (!context) {
        context = new AudioContext();
        gain = context.createGain();
        gain.gain.value = 0.15;
        gain.connect(context.destination);
      }
      void context.resume().catch(() => {});
      const audioContext = context;
      for (const name of Object.keys(urls) as Sound[]) {
        if (!buffers.has(name)) {
          buffers.set(
            name,
            fetch(urls[name])
              .then((response) => {
                if (!response.ok) throw new Error("Audio unavailable");
                return response.arrayBuffer();
              })
              .then((bytes) => audioContext.decodeAudioData(bytes))
              .catch(() => null),
          );
        }
      }
    } catch {
      /* The game remains playable when audio is unavailable. */
    }
  };

  const play = async (name: Sound) => {
    if (muted) return;
    const current = generation;
    const buffer = await buffers.get(name);
    if (
      !buffer ||
      muted ||
      current !== generation ||
      !context ||
      !gain ||
      context.state !== "running"
    )
      return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.onended = () => {
      playing.delete(source);
      source.disconnect();
    };
    playing.add(source);
    source.start();
  };

  const stop = () => {
    generation++;
    for (const source of playing) source.stop();
    playing.clear();
  };
  const setMuted = (value: boolean) => {
    muted = value;
    if (muted) stop();
  };
  return { unlock, play, stop, setMuted };
};
