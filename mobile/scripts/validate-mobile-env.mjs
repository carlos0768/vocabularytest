const requiredEnvNames = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_APP_URL',
  'EXPO_PUBLIC_ENABLE_TEST_PRO',
];

const placeholderPatterns = [
  /example/i,
  /your-/i,
  /changeme/i,
  /placeholder/i,
  /localhost/i,
  /127\.0\.0\.1/,
];

function isMissing(value) {
  return !value || value.trim().length === 0;
}

function looksLikePlaceholder(name, value) {
  if (name === 'EXPO_PUBLIC_ENABLE_TEST_PRO') {
    return value.trim() !== '1';
  }

  return placeholderPatterns.some((pattern) => pattern.test(value));
}

const failures = [];

for (const envName of requiredEnvNames) {
  const rawValue = process.env[envName];

  if (isMissing(rawValue)) {
    failures.push(`${envName} is missing.`);
    continue;
  }

  if (looksLikePlaceholder(envName, rawValue)) {
    failures.push(`${envName} must be set to a real internal-distribution value.`);
  }
}

if (failures.length > 0) {
  console.error('MERKEN internal build is blocked by invalid environment configuration.');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error('');
  console.error('Required variables:');
  for (const envName of requiredEnvNames) {
    console.error(`- ${envName}`);
  }
  process.exit(1);
}

console.log('MERKEN internal build environment looks valid.');
