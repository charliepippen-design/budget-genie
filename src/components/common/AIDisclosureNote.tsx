import { aiDisclosureShort } from '@/lib/ai-disclosure';
import { getUiLang } from '@/lib/ai-client';
import { useUserAIKey } from '@/lib/user-ai-key';

/** AI data-use disclosure for the current mode (shared trial or own key); Italian browsers get both languages. */
export function AIDisclosureNote({ className }: { className?: string }) {
  const ownKey = useUserAIKey() !== null;
  return (
    <>
      <p className={className}>{aiDisclosureShort(ownKey)}</p>
      {getUiLang() === 'it' && (
        <p lang="it" className={className}>
          {aiDisclosureShort(ownKey, 'it')}
        </p>
      )}
    </>
  );
}
