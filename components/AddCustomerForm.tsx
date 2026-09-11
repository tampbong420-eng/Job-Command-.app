"use client";

import { useState } from "react";

export default function AddCustomerForm({
  onAdd,
}: {
  onAdd: (input: {
    customerName: string;
    address: string;
    jobTitle: string;
    phone: string;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");

  function submit() {
    if (!customerName.trim()) return;
    onAdd({
      customerName: customerName.trim(),
      address: address.trim(),
      jobTitle: jobTitle.trim() || "New work",
      phone: phone.trim(),
    });
    setCustomerName("");
    setAddress("");
    setJobTitle("");
    setPhone("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className="ghost-action hours add-customer" onClick={() => setOpen(true)}>
        Add customer
      </button>
    );
  }

  return (
    <form
      className="plate add-customer-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <p className="card-label">New lead</p>
      <label>
        Customer
        <input
          value={customerName}
          onChange={(event) => setCustomerName(event.target.value)}
          required
        />
      </label>
      <label>
        Address
        <input value={address} onChange={(event) => setAddress(event.target.value)} />
      </label>
      <label>
        Job
        <input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
      </label>
      <label>
        Phone
        <input value={phone} onChange={(event) => setPhone(event.target.value)} />
      </label>
      <div className="rolodex-actions">
        <button type="button" className="ghost-action" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="ghost-action hours">
          Save lead
        </button>
      </div>
    </form>
  );
}
