ALTER TABLE creators ADD COLUMN gender TEXT NOT NULL DEFAULT '';
ALTER TABLE creators ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE creators ADD COLUMN social_accounts TEXT NOT NULL DEFAULT '{}';
ALTER TABLE creators ADD COLUMN payment_proof TEXT;
ALTER TABLE creators ADD COLUMN payment_snapshot TEXT NOT NULL DEFAULT '{}';
ALTER TABLE creators ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'not_required' CHECK(payment_status IN ('not_required','pending','verified','rejected'));
