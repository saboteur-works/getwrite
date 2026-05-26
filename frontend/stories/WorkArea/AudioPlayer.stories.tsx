import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { within, expect, waitFor } from "storybook/test";
import AudioPlayer from "../../components/WorkArea/Media/AudioPlayer";

/** Builds a valid silent PCM WAV data URI so stories play without network access. */
function silentWavDataUri(seconds: number): string {
  const sampleRate = 8000;
  const numSamples = Math.floor(sampleRate * seconds);
  const buffer = new ArrayBuffer(44 + numSamples);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string): void => {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, numSamples, true);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < numSamples; i++) bytes[44 + i] = 128; // 8-bit silence
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

const SAMPLE_AUDIO = silentWavDataUri(3);

const meta: Meta<typeof AudioPlayer> = {
  title: "WorkArea/Media/AudioPlayer",
  component: AudioPlayer,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: 160 }} className="bg-gw-bg">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof AudioPlayer>;

export const Default: Story = {
  args: { src: SAMPLE_AUDIO },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByLabelText("Play")).toBeInTheDocument();
    expect(canvas.getByLabelText("Seek")).toBeInTheDocument();
  },
};

export const WithKnownDuration: Story = {
  args: { src: SAMPLE_AUDIO, durationSeconds: 83 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Duration from the prop renders before the element loads its own metadata.
    expect(canvas.getByText("1:23")).toBeInTheDocument();
  },
};

export const ErrorState: Story = {
  args: { src: "/__nonexistent_audio__.mp3" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("alert")).toBeInTheDocument());
    expect(canvas.getByText("Unable to load audio.")).toBeInTheDocument();
  },
};
