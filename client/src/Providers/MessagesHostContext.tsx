import { useCallback, useMemo, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilState } from 'recoil';
import { setDefaultMessagesHost } from '@librechat/chat/react';
import type {
  ForkEvents,
  MessagesHost,
  ForkPreferences,
  ForkConversation,
  MessagesScrolling,
} from '@librechat/chat/react';
import type { TMessage } from 'librechat-data-provider';
import EventSubagentActivityGroup from '~/components/Chat/Subagents/EventSubagentActivityGroup';
import useConversationSeen from '~/hooks/Conversations/useConversationSeen';
import useMessageScrolling from '~/hooks/Messages/useMessageScrolling';
import ThreadMessage from '~/components/Chat/Messages/Thread/Message';
import { useFileMapContext } from '~/Providers/FileMapContext';
import Files from '~/components/Chat/Messages/Content/Files';
import { useScreenshot } from '~/hooks/ScreenshotContext';
import { useForkConvoMutation } from '~/data-provider';
import useClockFormat from '~/hooks/useClockFormat';
import { autoScrollAtom } from '~/store/autoScroll';
import { useNavigateToConvo } from '~/hooks';
import store from '~/store';

function useAppForkPreferences(): ForkPreferences {
  const [option, setOption] = useRecoilState(store.forkSetting);
  const [splitAtTarget, setSplitAtTarget] = useRecoilState(store.splitAtTarget);
  const [rememberOption, setRememberOption] = useRecoilState(store.rememberDefaultFork);
  return useMemo(
    () => ({
      option,
      setOption,
      splitAtTarget,
      setSplitAtTarget,
      rememberOption,
      setRememberOption,
    }),
    [option, setOption, splitAtTarget, setSplitAtTarget, rememberOption, setRememberOption],
  );
}

/** The events ride on the mutation's own callbacks, not `mutate`'s, so the fork still opens and
 *  reports when the row that started it unmounted before the server answered. */
function useAppForkConversation(): ForkConversation {
  const { navigateToConvo } = useNavigateToConvo();
  const events = useRef<ForkEvents | null>(null);
  const { mutate } = useForkConvoMutation({
    onSuccess: (data) => {
      navigateToConvo(data.conversation);
      events.current?.onSuccess();
    },
    onError: (error) => events.current?.onError(error),
  });
  return useCallback<ForkConversation>(
    (request, next) => {
      events.current = next;
      mutate(request);
    },
    [mutate],
  );
}

/** The app's scrolling hook, as the message list reads it. */
function useScrolling(messagesTree: TMessage[] | null | undefined): MessagesScrolling {
  const { conversation, ...scrolling } = useMessageScrolling(messagesTree);
  return { ...scrolling, conversationId: conversation?.conversationId };
}

/** What the message list reads from the app: the viewer's clock format and fork defaults, the
 *  fork request, its scrolling, screenshot and seen reporting, the thread's file map, and the row
 *  pieces that still live here: the message body and the subagent activity group. Registered as
 *  the default when this module loads, so rows read it on every route, the shared view included. */
export const appMessagesHost: MessagesHost = {
  useHour12: useClockFormat,
  renderFiles: (message) => <Files message={message} />,
  useForkPreferences: useAppForkPreferences,
  useForkConversation: useAppForkConversation,

  useScrolling,
  useScreenshotTarget: () => useScreenshot().screenshotTargetRef,
  useAutoScroll: () => useAtomValue(autoScrollAtom),
  useConversationSeen,
  renderMessageRow: (props) => <ThreadMessage {...props} />,
  renderActivity: (props) => <EventSubagentActivityGroup {...props} />,
  useFileMap: useFileMapContext,
};

setDefaultMessagesHost(appMessagesHost);
