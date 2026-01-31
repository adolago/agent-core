import type { MediaUnderstandingProvider } from "../../types.js";
import { transcribeGoogleSttAudio } from "./audio.js";

export const googleSttProvider: MediaUnderstandingProvider = {
  id: "google-stt",
  capabilities: ["audio"],
  transcribeAudio: transcribeGoogleSttAudio,
};
