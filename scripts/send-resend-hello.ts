import { sendHelloWorldEmail } from '@/lib/resend/client';

async function main() {
  const result = await sendHelloWorldEmail();

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  console.log(`Email sent: ${result.messageId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
