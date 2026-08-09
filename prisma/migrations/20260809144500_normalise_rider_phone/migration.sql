-- Phones are now stored E.164, so the unique index means one number = one rider.
-- IsPhoneNumber('IN') accepts '+919864886447', '09864886447', '9864886447' and
-- '+91 98648 86447' as the same number, and each was a separate row.
--
-- "phone" is UNIQUE, so if two rows collapse to the same E.164 value this fails
-- and the migration aborts - intentionally: that is two riders on one number, and
-- which survives is a decision for a person.
UPDATE "Rider"
SET "phone" = CASE
  -- 91XXXXXXXXXX (with or without +, spaces, hyphens)
  WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^91[6-9][0-9]{9}$'
    THEN '+' || regexp_replace("phone", '[^0-9]', '', 'g')
  -- XXXXXXXXXX or 0XXXXXXXXXX
  WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^0?[6-9][0-9]{9}$'
    THEN '+91' || right(regexp_replace("phone", '[^0-9]', '', 'g'), 10)
  ELSE "phone"
END
WHERE "phone" <> CASE
  WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^91[6-9][0-9]{9}$'
    THEN '+' || regexp_replace("phone", '[^0-9]', '', 'g')
  WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^0?[6-9][0-9]{9}$'
    THEN '+91' || right(regexp_replace("phone", '[^0-9]', '', 'g'), 10)
  ELSE "phone"
END;
