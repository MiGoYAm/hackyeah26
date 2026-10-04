import { Redirect } from 'expo-router';
import { useState } from 'react';

export default function ChatRedirect() {
  // A fresh request also restarts dictation when the app is already open.
  const [voiceRequest] = useState(() => String(Date.now()));
  return <Redirect href={{ pathname: '/', params: { voice: voiceRequest } }} />;
}
