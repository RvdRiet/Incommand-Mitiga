"use client";

import { useState } from "react";

import { useIncidentStore } from "@/context/EventContext";
import {
  buildSupplyAlert,
  DEFAULT_INVENTORY_REMINDER_DAYS,
  inventorySummary,
} from "@/lib/incident/inventory";
import { IconAlertTriangle } from "@/components/ui/icons";

export function NotificationsView() {
  const groups = useIncidentStore((s) => s.contactGroups);
  const notifications = useIncidentStore((s) => s.notifications);
  const inventory = useIncidentStore((s) => s.inventory);
  const settings = useIncidentStore((s) => s.settings);
  const addContactGroup = useIncidentStore((s) => s.addContactGroup);
  const updateContactGroup = useIncidentStore((s) => s.updateContactGroup);
  const removeContactGroup = useIncidentStore((s) => s.removeContactGroup);
  const queueNotification = useIncidentStore((s) => s.queueNotification);
  const removeNotification = useIncidentStore((s) => s.removeNotification);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(false);

  const reminderDays = settings.inventoryReminderDays ?? DEFAULT_INVENTORY_REMINDER_DAYS;
  const invSummary = inventorySummary(inventory, Date.now(), reminderDays);

  const draftSupplyAlert = () => {
    const alert = buildSupplyAlert(inventory, Date.now(), reminderDays);
    if (!alert) return;
    setSubject(alert.subject);
    setBody(alert.body);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const supplyBits = [
    invSummary.lowOut > 0 ? `${invSummary.lowOut} low/out of stock` : null,
    invSummary.expiryFlagged > 0 ? `${invSummary.expiryFlagged} expiring` : null,
    invSummary.maintFlagged > 0 ? `${invSummary.maintFlagged} service due` : null,
  ].filter(Boolean);

  const toggleGroup = (id: string) => {
    setSelectedGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  };

  const send = () => {
    if (!subject.trim() || selectedGroups.length === 0) return;
    const channels: ("email" | "sms")[] = [];
    if (email) channels.push("email");
    if (sms) channels.push("sms");
    if (channels.length === 0) return;
    queueNotification({
      subject: subject.trim(),
      body: body.trim(),
      groupIds: selectedGroups,
      channels,
    });
    setSubject("");
    setBody("");
    setSelectedGroups([]);
  };

  return (
    <section className="ic-notifications">
      <header className="ic-d4h-header">
        <h2 className="ic-d4h-header__title">Notifications</h2>
        <p className="ic-d4h-header__sub">
          Mass notification — compose alerts to contact groups. Delivery is simulated
          locally until SMS/email providers are connected (Twilio, Africa&apos;s Talking, etc.).
        </p>
      </header>

      {invSummary.attention > 0 ? (
        <div className="ic-supply-alert">
          <span className="ic-supply-alert__msg">
            <IconAlertTriangle size={15} />
            <span>
              <strong>
                {invSummary.attention} inventory item
                {invSummary.attention === 1 ? "" : "s"} need attention
              </strong>
              {supplyBits.length > 0 ? ` — ${supplyBits.join(" · ")}` : ""}
            </span>
          </span>
          <button type="button" className="ic-btn-secondary" onClick={draftSupplyAlert}>
            Draft supply alert
          </button>
        </div>
      ) : null}

      <div className="ic-notifications__grid">
        <article className="ic-notifications__compose">
          <h3>Compose alert</h3>
          <label className="ic-field">
            <span>Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="ic-field ic-field--full">
            <span>Message</span>
            <textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <fieldset className="ic-notifications__channels">
            <legend>Channels</legend>
            <label>
              <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
              Email
            </label>
            <label>
              <input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} />
              SMS
            </label>
          </fieldset>
          <fieldset className="ic-notifications__groups">
            <legend>Contact groups</legend>
            {groups.length === 0 ? (
              <p className="ic-empty-hint">Add a group below first.</p>
            ) : (
              groups.map((g) => (
                <label key={g.id} className="ic-notifications__group-pick">
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(g.id)}
                    onChange={() => toggleGroup(g.id)}
                  />
                  {g.name}
                </label>
              ))
            )}
          </fieldset>
          <button type="button" className="ic-btn-add" onClick={send}>
            Queue notification
          </button>
        </article>

        <article className="ic-notifications__groups-panel">
          <div className="ic-d4h-header__row">
            <h3>Contact groups</h3>
            <button type="button" className="ic-btn-secondary" onClick={addContactGroup}>
              + Group
            </button>
          </div>
          <ul className="ic-contact-groups">
            {groups.map((g) => (
              <li key={g.id} className="ic-contact-group">
                <input
                  className="ic-contact-group__name"
                  value={g.name}
                  onChange={(e) => updateContactGroup(g.id, { name: e.target.value })}
                />
                <input
                  className="ic-contact-group__desc"
                  placeholder="Description"
                  value={g.description}
                  onChange={(e) => updateContactGroup(g.id, { description: e.target.value })}
                />
                <textarea
                  className="ic-contact-group__members"
                  placeholder="Members — one per line (name, email, phone)"
                  rows={3}
                  value={g.members}
                  onChange={(e) => updateContactGroup(g.id, { members: e.target.value })}
                />
                <button
                  type="button"
                  className="ic-link-btn"
                  onClick={() => removeContactGroup(g.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <section className="ic-notifications__history">
        <h3>Delivery log</h3>
        {notifications.length === 0 ? (
          <p className="ic-empty-hint">No notifications sent yet.</p>
        ) : (
          <table className="ic-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Subject</th>
                <th>Channels</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {notifications.map((n) => (
                <tr key={n.id}>
                  <td>{new Date(n.createdAt).toLocaleString()}</td>
                  <td>{n.subject}</td>
                  <td>{n.channels.join(", ")}</td>
                  <td>
                    <span className={`ic-notif-status ic-notif-status--${n.status}`}>
                      {n.status}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ic-link-btn"
                      onClick={() => removeNotification(n.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
