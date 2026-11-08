/* Haushaltsbuch panel – Schedule helpers: presets, regular vs. special items, monthly equivalent.
 * Split out of haushaltsbuch-panel.js; plain ES module without build step.
 */
import { LANG, tr, fmtDate, weekdayLong, WEEK_ORDINALS, FREQUENCY_PRESETS, unitLabel } from "./format.js";

function presetOf(schedule) {
  const { frequency, interval } = schedule || {};
  if (frequency === "monthly" && schedule.weekday !== undefined && schedule.weekday !== null) return "monthly_weekday";
  if (frequency === "monthly") {
    if (interval === 1) return "monthly";
    if (interval === 3) return "quarterly";
    if (interval === 6) return "halfyearly";
    return "every_n_months";
  }
  if (frequency === "yearly") return "yearly";
  if (frequency === "weekly") return "weekly";
  if (frequency === "fixed_dates") return "fixed_dates";
  if (frequency === "rolling") return "rolling";
  if (frequency === "budget") return "budget";
  return "once";
}

// Items that are booked every month (or more often) are the "normal" ones in
// the month view; everything else is a special item that stands out.
function isRegular(item) {
  const preset = presetOf(item?.schedule);
  return preset === "monthly" || preset === "monthly_weekday" || preset === "weekly" || preset === "rolling" || preset === "budget";
}

// Months between two bookings (Infinity for one-off items, 0 for frequent ones).
function intervalMonths(item) {
  const s = item?.schedule || {};
  if (s.frequency === "once") return Infinity;
  if (s.frequency === "monthly") return s.interval || 1;
  if (s.frequency === "yearly") return 12 * (s.interval || 1);
  if (s.frequency === "fixed_dates") return 12 / Math.max(1, (s.dates || []).length);
  return 0;
}

const SPECIAL_OPTIONS = [
  [2, "alles, was nicht jeden Monat kommt", "everything not due every month"],
  [3, "ab vierteljährlich", "quarterly or less often"],
  [6, "ab halbjährlich", "every six months or less often"],
  [12, "nur jährlich und einmalig", "only yearly and one-off"],
  [999, "nur einmalige Posten", "only one-off entries"],
];

function scheduleLabel(item) {
  const s = item.schedule || {};
  const preset = presetOf(s);
  if (preset === "every_n_months") return tr(`alle ${s.interval} Monate`, `every ${s.interval} months`);
  if (preset === "rolling") {
    if (item.learned_days) return tr(`gleitend, gelernt alle ~${item.learned_days} Tage`, `rolling, learned every ~${item.learned_days} days`);
    return tr(`gleitend, alle ${s.interval || 1} ${unitLabel(s.interval || 1, s.unit)}`, `rolling, every ${s.interval || 1} ${unitLabel(s.interval || 1, s.unit)}`);
  }
  if (preset === "budget") return tr("Budget pro Monat", "monthly budget");
  if (preset === "monthly_weekday") {
    const ord = WEEK_ORDINALS.find(([w]) => w === (s.week ?? -1)) || WEEK_ORDINALS[4];
    return tr(`jeden ${ord[1]} ${weekdayLong(s.weekday)} im Monat`, `every ${ord[2]} ${weekdayLong(s.weekday)} of the month`);
  }
  if (preset === "weekly" && s.interval > 1) return tr(`alle ${s.interval} Wochen`, `every ${s.interval} weeks`);
  if (preset === "yearly" && s.interval > 1) return tr(`alle ${s.interval} Jahre`, `every ${s.interval} years`);
  if (preset === "fixed_dates") return (s.dates || []).map((md) => fmtDate(`2020-${md}`, { day: "2-digit", month: "2-digit" })).join(" & ");
  return FREQUENCY_PRESETS.find((p) => p.key === preset)[LANG];
}

function monthlyEquivalent(item) {
  const s = item.schedule || {};
  const amount = Number(item.current_amount ?? item.amount) || 0;
  const interval = s.interval || 1;
  switch (s.frequency) {
    case "budget":
      return amount;
    case "weekly":
      return (amount * 52) / 12 / interval;
    case "monthly":
      return amount / interval;
    case "yearly":
      return amount / 12 / interval;
    case "fixed_dates":
      return (amount * (s.dates || []).length) / 12;
    case "rolling":
      if (item.learned_days) return (amount * 365) / 12 / item.learned_days;
      return s.unit === "weeks" ? (amount * 52) / 12 / interval : amount / interval;
    default:
      return 0;
  }
}

export { presetOf, isRegular, intervalMonths, SPECIAL_OPTIONS, scheduleLabel, monthlyEquivalent };
