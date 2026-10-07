"use client";

import { Phone, MessageSquare, Mail } from "lucide-react";
import { mailHref, smsHref, telHref } from "@/lib/clients";

export function ContactStrip({
  phone,
  email,
  who,
}: {
  phone?: string;
  email?: string;
  who?: string;
}) {
  const call = phone ? telHref(phone) : "";
  const text = phone ? smsHref(phone) : "";
  const mail = email ? mailHref(email) : "";
  const subject = who ? encodeURIComponent(`${who} — estimate`) : "";
  return (
    <div className="contact-strip" role="group" aria-label="Contact">
      {call ? (
        <a className="contact-chip" href={call}>
          <Phone className="size-3.5" />
          Call
        </a>
      ) : (
        <span className="contact-chip off">
          <Phone className="size-3.5" />
          Call
        </span>
      )}
      {text ? (
        <a className="contact-chip" href={text}>
          <MessageSquare className="size-3.5" />
          Text
        </a>
      ) : (
        <span className="contact-chip off">
          <MessageSquare className="size-3.5" />
          Text
        </span>
      )}
      {mail ? (
        <a className="contact-chip" href={subject ? `${mail}?subject=${subject}` : mail}>
          <Mail className="size-3.5" />
          Email
        </a>
      ) : (
        <span className="contact-chip off">
          <Mail className="size-3.5" />
          Email
        </span>
      )}
    </div>
  );
}
