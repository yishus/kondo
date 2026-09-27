import { useEffect, useState } from "react";

export function TimezoneOptions() {
  const [zones, setZones] = useState<string[]>([]);
  useEffect(() => { setZones(Intl.supportedValuesOf("timeZone")); }, []);
  return <datalist id="timezone-options"><option value="UTC" />{zones.map((zone) => <option key={zone} value={zone} />)}</datalist>;
}

export function TimezoneField({ label = "Time zone", name = "timezone", timezone, onChange, placeholder = "Not set", disabled = false }: {
  label?: string;
  name?: string;
  timezone?: string | null;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return <label className="ui-field min-w-0">{label}
    <input className="ui-input" name={name} list="timezone-options"
      {...(onChange ? { value: timezone ?? "", onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value) } : { defaultValue: timezone ?? "" })}
      placeholder={placeholder} autoComplete="off" maxLength={100} disabled={disabled} />
  </label>;
}
