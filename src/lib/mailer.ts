import { Resend } from "resend";
import { env } from "../config/env.js";

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  if (!resend) {
    // No provider configured (local dev): print the email so links can still be followed.
    console.log(`\n[mail] To: ${mail.to}\n[mail] Subject: ${mail.subject}\n${mail.text}\n`);
    return;
  }
  const { error } = await resend.emails.send({ from: env.mailFrom, ...mail });
  if (error) throw new Error(`Failed to send email: ${error.message}`);
}
