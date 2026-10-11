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
  return <label className="grid gap-1.5 text-secondary-foreground text-[12px] font-medium min-w-0">{label}
    <input className="w-full min-w-0 min-h-9 py-2 px-2.5 border border-border rounded-md bg-surface text-foreground text-[13px] font-normal leading-[1.45] [outline:none] transition-[border-color] duration-150 [&:hover:not(:disabled)]:border-input focus-visible:border-primary focus-visible:[outline:1px_solid_var(--primary)] focus-visible:outline-offset-0 aria-invalid:border-destructive disabled:opacity-[.5] disabled:cursor-not-allowed [[type='file']]:p-1.5 [[type='file']]:text-muted-foreground [[type='file']]:text-[12px] file:mr-2.5 file:py-0.75 file:px-1.75 file:border-0 file:rounded-[3px] file:bg-muted file:text-foreground file:[font:inherit] file:cursor-pointer" name={name} list="timezone-options"
      {...(onChange ? { value: timezone ?? "", onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value) } : { defaultValue: timezone ?? "" })}
      placeholder={placeholder} autoComplete="off" maxLength={100} disabled={disabled} />
  </label>;
}
