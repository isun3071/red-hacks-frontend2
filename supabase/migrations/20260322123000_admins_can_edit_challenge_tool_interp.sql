-- Allow all authenticated users to read these entities, but only admins can modify them.
-- This makes edits global across admins (not limited by created_by ownership).

DROP POLICY IF EXISTS "Allow all operations for anon" ON challenges;
DROP POLICY IF EXISTS "Allow all operations for authenticated" ON challenges;
DROP POLICY IF EXISTS "Allow all operations for anon" ON tools;
DROP POLICY IF EXISTS "Allow all operations for authenticated" ON tools;
DROP POLICY IF EXISTS "Allow all operations for anon" ON interp_args;
DROP POLICY IF EXISTS "Allow all operations for authenticated" ON interp_args;
DROP POLICY IF EXISTS "Allow all operations for anon" ON challenge_tools;
DROP POLICY IF EXISTS "Allow all operations for authenticated" ON challenge_tools;

CREATE POLICY "Authenticated users can read challenges"
ON challenges FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can modify challenges"
ON challenges FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);

CREATE POLICY "Authenticated users can read tools"
ON tools FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can modify tools"
ON tools FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);

CREATE POLICY "Authenticated users can read interp args"
ON interp_args FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can modify interp args"
ON interp_args FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);

CREATE POLICY "Authenticated users can read challenge tools"
ON challenge_tools FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can modify challenge tools"
ON challenge_tools FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);
