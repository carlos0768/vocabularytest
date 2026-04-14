'use client';

import { useEffect, useRef, useState } from 'react';

export type RewardedDownloadAdOutcome = 'granted' | 'dismissed' | 'unavailable';

type GoogleRewardedSlot = {
  addService(service: GooglePublisherAdsService): GoogleRewardedSlot;
};

type RewardedSlotReadyEvent = {
  slot: GoogleRewardedSlot;
  makeRewardedVisible(): boolean;
};

type RewardedSlotGrantedEvent = {
  slot: GoogleRewardedSlot;
};

type RewardedSlotClosedEvent = {
  slot: GoogleRewardedSlot;
};

type SlotRenderEndedEvent = {
  slot: GoogleRewardedSlot;
  isEmpty?: boolean;
};

type GooglePublisherAdsService = {
  addEventListener(
    eventName: 'rewardedSlotReady' | 'rewardedSlotGranted' | 'rewardedSlotClosed' | 'slotRenderEnded',
    listener: (
      event:
        | RewardedSlotReadyEvent
        | RewardedSlotGrantedEvent
        | RewardedSlotClosedEvent
        | SlotRenderEndedEvent,
    ) => void,
  ): void;
  removeEventListener?: (
    eventName: 'rewardedSlotReady' | 'rewardedSlotGranted' | 'rewardedSlotClosed' | 'slotRenderEnded',
    listener: (
      event:
        | RewardedSlotReadyEvent
        | RewardedSlotGrantedEvent
        | RewardedSlotClosedEvent
        | SlotRenderEndedEvent,
    ) => void,
  ) => void;
};

type GoogleTag = {
  apiReady?: boolean;
  cmd: Array<() => void>;
  enums: {
    OutOfPageFormat: {
      REWARDED: unknown;
    };
  };
  pubads(): GooglePublisherAdsService;
  enableServices(): void;
  defineOutOfPageSlot(path: string, format: unknown): GoogleRewardedSlot | null;
  display(slot: GoogleRewardedSlot): void;
  destroySlots(slots?: GoogleRewardedSlot[]): boolean;
  _merkenRewardedServicesEnabled?: boolean;
};

declare global {
  interface Window {
    googletag?: GoogleTag;
  }
}

const REWARDED_DOWNLOAD_AD_UNIT_PATH =
  process.env.NEXT_PUBLIC_GOOGLE_AD_MANAGER_REWARDED_DOWNLOAD_UNIT_PATH?.trim() ?? '';

const DEFAULT_CONFIRM_MESSAGE =
  '動画広告を最後まで視聴すると単語帳を追加できます。再生しますか？';

const GPT_READY_TIMEOUT_MS = 5000;

type ShowRewardedDownloadAdOptions = {
  confirmMessage?: string;
};

export function useRewardedDownloadAd() {
  const [isPreparing, setIsPreparing] = useState(false);
  const mountedRef = useRef(true);
  const activeRequestRef = useRef(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const showRewardedDownloadAd = async (
    options?: ShowRewardedDownloadAdOptions,
  ): Promise<RewardedDownloadAdOutcome> => {
    if (activeRequestRef.current) {
      return 'dismissed';
    }

    if (!REWARDED_DOWNLOAD_AD_UNIT_PATH) {
      return 'unavailable';
    }

    activeRequestRef.current = true;
    if (mountedRef.current) {
      setIsPreparing(true);
    }

    return new Promise<RewardedDownloadAdOutcome>((resolve) => {
      let resolved = false;
      let rewardGranted = false;
      let slot: GoogleRewardedSlot | null = null;
      let pubAds: GooglePublisherAdsService | null = null;

      const finish = (outcome: RewardedDownloadAdOutcome) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        activeRequestRef.current = false;

        if (pubAds?.removeEventListener) {
          pubAds.removeEventListener('rewardedSlotReady', onReady);
          pubAds.removeEventListener('rewardedSlotGranted', onGranted);
          pubAds.removeEventListener('rewardedSlotClosed', onClosed);
          pubAds.removeEventListener('slotRenderEnded', onRenderEnded);
        }

        if (slot && window.googletag) {
          window.googletag.destroySlots([slot]);
        }

        if (mountedRef.current) {
          setIsPreparing(false);
        }

        resolve(outcome);
      };

      const onReady = (event: RewardedSlotReadyEvent | RewardedSlotGrantedEvent | RewardedSlotClosedEvent | SlotRenderEndedEvent) => {
        if (!slot || !('makeRewardedVisible' in event) || event.slot !== slot) {
          return;
        }

        const shouldPlay = window.confirm(
          options?.confirmMessage ?? DEFAULT_CONFIRM_MESSAGE,
        );
        if (!shouldPlay) {
          finish('dismissed');
          return;
        }

        const visible = event.makeRewardedVisible();
        if (!visible) {
          finish('unavailable');
        }
      };

      const onGranted = (event: RewardedSlotReadyEvent | RewardedSlotGrantedEvent | RewardedSlotClosedEvent | SlotRenderEndedEvent) => {
        if (!slot || !('slot' in event) || event.slot !== slot) {
          return;
        }
        rewardGranted = true;
      };

      const onClosed = (event: RewardedSlotReadyEvent | RewardedSlotGrantedEvent | RewardedSlotClosedEvent | SlotRenderEndedEvent) => {
        if (!slot || !('slot' in event) || event.slot !== slot) {
          return;
        }
        finish(rewardGranted ? 'granted' : 'dismissed');
      };

      const onRenderEnded = (event: RewardedSlotReadyEvent | RewardedSlotGrantedEvent | RewardedSlotClosedEvent | SlotRenderEndedEvent) => {
        if (!slot || !('isEmpty' in event) || event.slot !== slot) {
          return;
        }
        if (event.isEmpty) {
          finish('unavailable');
        }
      };

      const timeoutId = window.setTimeout(() => {
        finish('unavailable');
      }, GPT_READY_TIMEOUT_MS);

      try {
        const googletag = window.googletag ?? ({ cmd: [] } as GoogleTag);
        window.googletag = googletag;

        googletag.cmd.push(() => {
          if (resolved) return;

          try {
            const liveGoogleTag = window.googletag;
            if (!liveGoogleTag?.pubads || !liveGoogleTag.enums?.OutOfPageFormat?.REWARDED) {
              finish('unavailable');
              return;
            }

            pubAds = liveGoogleTag.pubads();

            slot = liveGoogleTag.defineOutOfPageSlot(
              REWARDED_DOWNLOAD_AD_UNIT_PATH,
              liveGoogleTag.enums.OutOfPageFormat.REWARDED,
            );

            if (!slot) {
              finish('unavailable');
              return;
            }

            slot.addService(pubAds);

            pubAds.addEventListener('rewardedSlotReady', onReady);
            pubAds.addEventListener('rewardedSlotGranted', onGranted);
            pubAds.addEventListener('rewardedSlotClosed', onClosed);
            pubAds.addEventListener('slotRenderEnded', onRenderEnded);

            if (!liveGoogleTag._merkenRewardedServicesEnabled) {
              liveGoogleTag.enableServices();
              liveGoogleTag._merkenRewardedServicesEnabled = true;
            }

            liveGoogleTag.display(slot);
          } catch (error) {
            console.error('Failed to prepare rewarded download ad', error);
            finish('unavailable');
          }
        });
      } catch (error) {
        console.error('Failed to queue rewarded download ad', error);
        finish('unavailable');
      }
    });
  };

  return {
    isConfigured: Boolean(REWARDED_DOWNLOAD_AD_UNIT_PATH),
    isPreparing,
    showRewardedDownloadAd,
  };
}
