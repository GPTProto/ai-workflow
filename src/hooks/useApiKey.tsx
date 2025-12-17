'use client';

import { useState, useEffect, useCallback } from 'react';

const API_KEY_STORAGE_KEY = 'video-workflow-api-key';

export function useApiKey() {
  const [apiKey, setApiKeyState] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load API Key from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
      setApiKeyState(savedKey || '');
      setIsLoaded(true);
    }
  }, []);

  // Save API Key to localStorage
  const setApiKey = useCallback((key: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
      setApiKeyState(key);
    }
  }, []);

  // Check if there is a valid API Key
  const hasApiKey = Boolean(apiKey && apiKey.trim());

  return {
    apiKey,
    setApiKey,
    hasApiKey,
    isLoaded,
  };
}
