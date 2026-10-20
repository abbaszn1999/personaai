import { site, whatsappUrl } from "@/lib/site";

/** A floating "chat on WhatsApp" button on every page. It is a plain link: tapping it opens
 *  WhatsApp (the app on a phone, WhatsApp Web on a computer) with a chat to Autommerce and a
 *  first message already typed. */
export function WhatsAppButton() {
  return (
    <a
      href={whatsappUrl()}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Chat with us on WhatsApp, ${site.whatsappDisplay}`}
      className="group fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] z-40 flex items-center gap-3 rounded-full bg-[#25D366] p-3.5 text-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)] transition-[transform,filter] duration-300 hover:scale-105 hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#25D366] min-[900px]:px-5 min-[900px]:py-3.5"
    >
      <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" fill="currentColor" aria-hidden>
        <path d="M16.04 3C9.13 3 3.5 8.62 3.5 15.53c0 2.2.58 4.35 1.67 6.25L3.4 28.6l6.99-1.83a12.5 12.5 0 0 0 5.65 1.37h.01c6.9 0 12.53-5.62 12.53-12.53 0-3.35-1.3-6.5-3.67-8.87A12.43 12.43 0 0 0 16.04 3Zm0 22.9h-.01a10.4 10.4 0 0 1-5.3-1.45l-.38-.22-4.15 1.09 1.11-4.05-.25-.41a10.37 10.37 0 0 1-1.6-5.53c0-5.74 4.67-10.4 10.42-10.4 2.78 0 5.4 1.08 7.36 3.05a10.33 10.33 0 0 1 3.05 7.36c0 5.74-4.68 10.55-10.25 10.55Zm5.7-7.79c-.31-.16-1.85-.91-2.14-1.02-.29-.1-.5-.16-.7.16-.21.31-.81 1.02-.99 1.22-.18.21-.37.24-.68.08-.31-.16-1.32-.49-2.5-1.55-.92-.82-1.55-1.84-1.73-2.15-.18-.31-.02-.48.14-.63.14-.14.31-.37.47-.55.16-.18.21-.31.31-.52.1-.21.05-.39-.03-.55-.08-.16-.7-1.69-.96-2.31-.25-.6-.51-.52-.7-.53h-.6c-.21 0-.55.08-.84.39-.29.31-1.1 1.07-1.1 2.61 0 1.54 1.13 3.03 1.28 3.24.16.21 2.21 3.37 5.35 4.73.75.32 1.33.51 1.78.66.75.24 1.43.2 1.97.12.6-.09 1.85-.76 2.11-1.49.26-.73.26-1.36.18-1.49-.07-.13-.28-.21-.6-.37Z" />
      </svg>
      <span className="hidden text-sm font-semibold min-[900px]:inline">Chat on WhatsApp</span>
    </a>
  );
}
