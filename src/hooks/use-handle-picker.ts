'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const USER_HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

/**
 * The ユーザーID picker of the onboarding profile step: normalizes what is
 * typed, checks availability against /api/auth/check-handle (debounced) and
 * keeps a row of free candidates from /api/auth/suggest-handle. Shared by
 * /signup and /onboarding so both screens behave the same.
 */
export function useHandlePicker(params: {
  /** The display name the candidates are derived from. */
  displayName: string;
  /** Only while true are candidates refreshed as the name is typed. */
  active: boolean;
}) {
  const { displayName, active } = params;
  const [userHandle, setUserHandle] = useState('');
  const [handleAvailable, setHandleAvailable] = useState<boolean | null>(null);
  const [handleChecking, setHandleChecking] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const checkTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Only the newest suggestion request may write state — the name is typed
  // character by character, so slower earlier responses would otherwise land last.
  const suggestRequestRef = useRef(0);

  // Candidate IDs come from the server so they are already known to be free —
  // inventing a `[a-z0-9_]{3,20}` handle from scratch is where signups stall.
  const loadSuggestions = useCallback(async (input: { name: string; handle?: string }) => {
    const requestId = suggestRequestRef.current + 1;
    suggestRequestRef.current = requestId;
    setSuggestionsLoading(true);
    try {
      const query = new URLSearchParams({ name: input.name.trim() });
      if (input.handle) query.set('handle', input.handle);
      const res = await fetch(`/api/auth/suggest-handle?${query.toString()}`);
      const data = await res.json() as { suggestions?: string[] };
      if (suggestRequestRef.current !== requestId) return;
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch {
      if (suggestRequestRef.current !== requestId) return;
      setSuggestions([]);
    } finally {
      if (suggestRequestRef.current === requestId) setSuggestionsLoading(false);
    }
  }, []);

  const checkAvailability = useCallback((handle: string, name: string) => {
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    if (!USER_HANDLE_PATTERN.test(handle)) {
      setHandleAvailable(null);
      return;
    }
    setHandleChecking(true);
    checkTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-handle?handle=${encodeURIComponent(handle)}`);
        const data = await res.json() as { available?: boolean };
        const available = data.available ?? false;
        setHandleAvailable(available);
        // A taken ID is exactly when alternatives are worth offering, so reseed
        // the candidates from what the user actually wanted.
        if (!available) void loadSuggestions({ name, handle });
      } catch {
        setHandleAvailable(null);
      } finally {
        setHandleChecking(false);
      }
    }, 400);
  }, [loadSuggestions]);

  const changeHandle = useCallback((value: string) => {
    const normalized = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUserHandle(normalized);
    setHandleAvailable(null);
    checkAvailability(normalized, displayName);
  }, [checkAvailability, displayName]);

  const applySuggestion = useCallback((candidate: string) => {
    setUserHandle(candidate);
    // The suggestion was free when the server built it; re-check anyway so the
    // badge reflects a real lookup rather than an assumption.
    checkAvailability(candidate, displayName);
  }, [checkAvailability, displayName]);

  const refreshSuggestions = useCallback(() => {
    void loadSuggestions({ name: displayName, handle: userHandle });
  }, [loadSuggestions, displayName, userHandle]);

  // Refresh candidates as the name is typed (debounced), and once on mount so
  // the profile step never shows an empty candidate row.
  useEffect(() => {
    if (!active) return;
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    suggestTimerRef.current = setTimeout(() => {
      void loadSuggestions({ name: displayName });
    }, displayName ? 600 : 0);
    return () => {
      if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    };
  }, [active, displayName, loadSuggestions]);

  useEffect(() => () => {
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
  }, []);

  return {
    userHandle,
    changeHandle,
    applySuggestion,
    handleAvailable,
    handleChecking,
    suggestions,
    suggestionsLoading,
    refreshSuggestions,
    /** Valid format and not known to be taken. */
    isHandleUsable: USER_HANDLE_PATTERN.test(userHandle) && handleAvailable !== false,
  };
}
