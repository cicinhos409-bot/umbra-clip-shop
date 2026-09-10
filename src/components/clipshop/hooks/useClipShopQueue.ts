import { useRef, useState } from "react";

export function useClipShopQueue() {
  const [processing, setProcessing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [queueMessage, setQueueMessage] = useState("");
  const pauseRef = useRef(false);
  const cancelRef = useRef(false);
  const renderAbortRef = useRef<AbortController | null>(null);

  return {
    processing, setProcessing,
    paused, setPaused,
    queueMessage, setQueueMessage,
    pauseRef, cancelRef, renderAbortRef,
  };
}
