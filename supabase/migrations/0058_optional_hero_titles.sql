-- Optional visible Hero titles for HOME, BIO, Music, Gallery, Showreel and Contact.
-- Empty text means deliberately no heading; NULL, missing keys and non-strings
-- remain invalid. The existing 220-character maximum remains unchanged.
-- No content, media, page order, constraints, grants or timestamps are rewritten.
begin;

do $$
declare
  v_target record;
  v_body text;
  v_definition text;
  v_hash text;
  v_safe boolean;
  v_source text;
  v_replacement text;
begin
  if pg_catalog.to_regprocedure('public.save_hero_with_framing_v2(text,text,timestamp with time zone,jsonb)') is null
    or pg_catalog.to_regprocedure('public.save_home_editorial_section_v2(text,text,timestamp with time zone,jsonb)') is null
    or (select count(*) from pg_catalog.pg_trigger
      where tgrelid in (pg_catalog.to_regclass('public.page_heroes'), pg_catalog.to_regclass('public.home_page_config'))
        and tgname = 'zz_media_library_reference_guard_v2'
        and tgenabled in ('O', 'A') and not tgisinternal) <> 2 then
    raise exception 'optional_hero_titles_requires_0046_0055_and_media_guards' using errcode = '55000';
  end if;

  -- Only six exact, known bodies may change. CREATE OR REPLACE retains the
  -- existing function identity/owner/ACL; its definition retains all metadata,
  -- strict payload validation, URL checks, row/advisory locks and version CAS.
  -- The second hash accepts safe reruns without changing the function again.
  for v_target in select * from (values
    ('public.save_music_hero_v2(text,timestamp with time zone,jsonb)', 'a69f8990677df2885e050144848cf637', 'a416704ff753e1ab6195b35cc647b69c', false),
    ('public.save_bio_hero_v2(text,timestamp with time zone,jsonb)', 'bcf0ebaaad885c6e21f2b7d96efe8fd9', '11901aa43d0aa929c676ed645e6054f5', false),
    ('public.save_gallery_hero_v2(text,timestamp with time zone,jsonb)', '47d2d1401932b44e2f91c1c7a2c68dc2', '2f9d4b4629be3adb54268706ed61e4e1', false),
    ('public.save_showreel_hero_v2(text,timestamp with time zone,jsonb)', '4d8ff9c1d09100c7722ace72c0c8df5b', '60c9fd307ebe02dd1ce2e18f671bea37', false),
    ('public.save_contact_hero_v2(text,timestamp with time zone,jsonb)', '430d66c23d9748a0bba9489da44ddeac', 'ddcd253a7f0c23c3e0a21f1cdb5319dc', false),
    ('public.validate_home_section_v2(text,jsonb)', '01ce11bfaa6df5593a11b3f728a56ed8', 'a1af7dfa230247ccc2ee8344e9ab17d1', true)
  ) target(signature, before_hash, after_hash, is_helper) loop
    select prosrc, pg_catalog.pg_get_functiondef(oid), prosecdef and proconfig @> array['search_path=""']
      into v_body, v_definition, v_safe
      from pg_catalog.pg_proc where oid = pg_catalog.to_regprocedure(v_target.signature);
    v_hash := pg_catalog.md5(pg_catalog.replace(v_body, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10)));
    if v_safe is distinct from true or v_hash is null or v_hash not in (v_target.before_hash, v_target.after_hash) then
      raise exception 'optional_hero_titles_requires_known_contract: %', v_target.signature using errcode = '55000';
    end if;

    if v_hash = v_target.before_hash then
      v_source := case when v_target.is_helper then
        $source$v_result ->> 'title' = '' or v_result ->> 'backgroundSrc' = ''$source$
        else $source$pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'title')) not between 1 and 220$source$ end;
      v_replacement := case when v_target.is_helper then
        $source$v_result ->> 'backgroundSrc' = ''$source$
        else $source$pg_catalog.char_length(pg_catalog.btrim(p_payload ->> 'title')) > 220$source$ end;
      if (pg_catalog.length(v_body) - pg_catalog.length(pg_catalog.replace(v_body, v_source, ''))) <> pg_catalog.length(v_source) then
        raise exception 'optional_hero_titles_requires_single_title_check: %', v_target.signature using errcode = '55000';
      end if;
      execute pg_catalog.replace(v_definition, v_source, v_replacement);
      select pg_catalog.md5(pg_catalog.replace(prosrc, pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10)))
        into v_hash from pg_catalog.pg_proc where oid = pg_catalog.to_regprocedure(v_target.signature);
      if v_hash is distinct from v_target.after_hash then
        raise exception 'optional_hero_titles_patch_mismatch: %', v_target.signature using errcode = '55000';
      end if;
    end if;
  end loop;
end; $$;

-- page_heroes.title is already text NOT NULL and permits ''. The HOME JSON
-- validator still requires the exact title key and a string. No relaxation of
-- table NULL constraints or unrelated content validators is necessary.
commit;
