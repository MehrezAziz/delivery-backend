-- Fix referral code owner_id to match customer_id
-- This updates all referral codes where owner_id doesn't match the customer who should own it

UPDATE referral_codes rc
SET owner_id = c.id
FROM customers c
WHERE rc.id IN (
  SELECT rc2.id 
  FROM referral_codes rc2
  WHERE rc2.owner_id IS NOT NULL
  AND rc2.owner_id != (
    SELECT c2.id 
    FROM customers c2 
    WHERE c2.user_id = (
      SELECT u.id 
      FROM users u 
      WHERE u.phone = (
        SELECT u2.phone 
        FROM users u2 
        INNER JOIN customers c3 ON u2.id = c3.user_id 
        WHERE c3.id = rc2.owner_id
      )
    )
  )
);

-- Simpler approach: For each customer, find their referral code and update owner_id
UPDATE referral_codes
SET owner_id = (
  SELECT c.id
  FROM customers c
  WHERE c.id = referral_codes.owner_id
  OR c.user_id IN (
    SELECT u.id 
    FROM users u
    WHERE u.id = (
      SELECT c2.user_id 
      FROM customers c2 
      WHERE c2.id = referral_codes.owner_id
    )
  )
)
WHERE owner_id IS NOT NULL;
