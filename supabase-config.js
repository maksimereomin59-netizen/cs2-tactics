/* CS2 Team Playbook — конфигурация облака Supabase.
   Это единственный файл, который нужно заполнить, чтобы правки капитана
   долетали до игроков (см. SETUP.md):
   1. Supabase → кнопка Connect (или Settings → API Keys).
   2. Скопируйте Project URL и публичный ключ для браузера:
      новый формат sb_publishable_… или legacy anon public key (eyJ…).
   3. Вставьте их ниже вместо заглушек и запушьте файл в main.

   ВАЖНО: нужен публичный ключ — он публичный по дизайну, доступ к данным
   закрыт RLS-политиками базы. Секретный ключ (sb_secret_… или legacy
   service_role) сюда вставлять нельзя: он обходит защиту базы, и приложение
   откажется его использовать.
   Пока значения — заглушки, приложение работает локально на устройстве. */
window.SUPABASE_CONFIG = {
  url: "https://emhplcinxtzyantctsgr.supabase.co",
  anonKey: "sb_publishable_8lIXU9qioEN21u2H8mvewQ_-O8oUVWx"
};
