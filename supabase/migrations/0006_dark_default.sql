-- ============================================================================
-- CRMO — dark by default
--
-- Dark is now the theme a new person starts in. Every existing row holds
-- 'light' because that was the column default, so whether it was ever picked
-- is recorded from here on: the app reads a 'light' with theme_chosen = false
-- as the old default and shows dark instead.
-- ============================================================================

alter table public.user_settings alter column theme set default 'dark';
alter table public.user_settings add column if not exists theme_chosen boolean not null default false;
