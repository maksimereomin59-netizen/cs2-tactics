/* CS2 Team Playbook — конфигурация облака Supabase.
   Это единственный файл, который нужно заполнить, чтобы правки капитана
   долетали до игроков (см. SETUP.md):
   1. Supabase → Settings → API.
   2. Скопируйте Project URL и anon public key.
   3. Вставьте их ниже вместо заглушек и запушьте файл в main.

   ВАЖНО: нужен именно anon public key — он публичный по дизайну,
   доступ к данным закрыт RLS-политиками базы. Service_role key сюда
   вставлять нельзя: приложение откажется его использовать.
   Пока значения — заглушки, приложение работает локально на устройстве. */
window.SUPABASE_CONFIG = {
  url: "https://xxxx.supabase.co",
  anonKey: "PASTE_ANON_KEY_HERE"
};
