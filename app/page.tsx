"use client";

import { useEffect, useRef, useState } from 'react';

export default function HomePage() {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<string>('Idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);

  useEffect(() => {
    return () => {
      stopCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCall() {
    try {
      setError(null);
      setStatus('Preparing...');

      const resp = await fetch('/api/session');
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Failed to get session');
      }
      const { client_secret, model } = await resp.json();

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // play remote audio
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (audioElRef.current) {
          audioElRef.current.srcObject = remoteStream;
          audioElRef.current.play().catch(() => {});
        }
      };

      // optional: data channel for realtime events
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      dc.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data?.type && typeof data.type === 'string') {
            if (data.type.includes('transcript') || data.type.includes('input') || data.type.includes('response')) {
              setTranscript((prev) => (prev + '\n' + JSON.stringify(data)).slice(-8000));
            }
          }
        } catch {
          // ignore
        }
      };

      // add mic
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = mic;
      for (const track of mic.getTracks()) {
        pc.addTrack(track, mic);
      }
      // ensure we can receive audio
      pc.addTransceiver('audio', { direction: 'recvonly' });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      setStatus('Connecting AI...');

      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${client_secret}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp ?? '',
        }
      );

      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text();
        throw new Error(errText || 'Failed to create Realtime session');
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      setConnected(true);
      setStatus('Connected');
    } catch (e: any) {
      setError(e?.message || String(e));
      setStatus('Error');
      stopCall();
    }
  }

  function stopCall() {
    try {
      dcRef.current?.close();
      dcRef.current = null;
      pcRef.current?.getSenders().forEach((s) => {
        try { s.track?.stop(); } catch {}
      });
      pcRef.current?.close();
      pcRef.current = null;
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    } finally {
      setConnected(false);
      setStatus('Idle');
    }
  }

  return (
    <main className="container">
      <h1>AI Calling Agent</h1>
      <p className="muted">Two-way voice with OpenAI Realtime</p>

      <div className="controls">
        {!connected ? (
          <button className="btn" onClick={startCall}>Start Call</button>
        ) : (
          <button className="btn btn-danger" onClick={stopCall}>End Call</button>
        )}
        <span className={`status ${connected ? 'ok' : ''}`}>{status}</span>
      </div>

      <audio ref={audioElRef} autoPlay playsInline />

      <div className="panel">
        <h2>Events</h2>
        <pre className="log" aria-live="polite">{transcript}</pre>
        {error && <p className="error">{error}</p>}
      </div>
    </main>
  );
}
