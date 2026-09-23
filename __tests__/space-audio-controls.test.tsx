import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpaceAudioControls } from '@/components/floor-plan/SpaceAudioControls';

const audio = vi.hoisted(() => ({
  webrtcManager: null as { getLocalStream: () => MediaStream | null } | null,
  isMuted: true,
  isAudioEnabled: false,
  isInitializing: false,
  micPermission: 'prompt' as 'prompt' | 'granted' | 'denied' | 'unavailable',
  error: null as string | null,
  initializeAudio: vi.fn(async () => true),
  toggleMute: vi.fn(),
  peerCount: 0,
}));

const voice = vi.hoisted(() => ({
  isSpeaking: false,
}));

vi.mock('@/contexts/AudioContext', () => ({
  useAudio: () => audio,
}));

vi.mock('@/hooks/useVoiceActivity', () => ({
  useVoiceActivity: () => voice,
}));

describe('SpaceAudioControls VID-02 regressions', () => {
  beforeEach(() => {
    audio.webrtcManager = null;
    audio.isMuted = true;
    audio.isAudioEnabled = false;
    audio.isInitializing = false;
    audio.micPermission = 'prompt';
    audio.error = null;
    audio.initializeAudio.mockClear();
    audio.toggleMute.mockClear();
    voice.isSpeaking = false;
  });

  it('enters a space listen-only until the user explicitly enables the microphone', () => {
    render(<SpaceAudioControls />);
    expect(audio.initializeAudio).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enable microphone' }));
    expect(audio.initializeAudio).toHaveBeenCalledTimes(1);
  });

  it('exposes explicit mute and unmute actions without changing audio automatically', () => {
    audio.isAudioEnabled = true;
    const view = render(<SpaceAudioControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }));
    expect(audio.toggleMute).toHaveBeenCalledTimes(1);

    audio.isMuted = false;
    view.rerender(<SpaceAudioControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Mute microphone' }));
    expect(audio.toggleMute).toHaveBeenCalledTimes(2);
  });

  it('keeps M typing-safe while toggling from a non-editable target', () => {
    audio.isAudioEnabled = true;
    render(
      <>
        <input aria-label="Message" />
        <SpaceAudioControls />
      </>,
    );
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Message' }), { key: 'm' });
    expect(audio.toggleMute).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'm' });
    expect(audio.toggleMute).toHaveBeenCalledTimes(1);
  });

  it('announces and styles speaking independently from mute copy', () => {
    audio.isAudioEnabled = true;
    audio.isMuted = false;
    voice.isSpeaking = true;
    render(<SpaceAudioControls />);
    const button = screen.getByRole('button', { name: 'Mute microphone, speaking' });
    expect(button).toHaveAttribute('data-speaking', 'true');
    expect(button).toHaveClass('ring-2');
  });
});
