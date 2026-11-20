import { useRef, useState } from 'react';
import Icon from '../../components/Icon';
import Sheet from '../../components/Sheet';
import { btn, card, PageHeader, Row, SectionTitle } from '../../components/ui';
import { today } from '../../domain/dates';
import { formatRest, REST_OPTIONS } from '../../domain/workout';
import { useDbQuery } from '../../hooks/useDbQuery';
import { getDefaultRest, setDefaultRest } from '../../repositories/exercises';
import { exportData, importFile } from '../../repositories/dataTransfer';
import { useAuth } from '../auth/AuthGate';
import InviteSheet from './InviteSheet';

export default function SettingsScreen() {
  const [message, setMessage] = useState('');
  const defaultRest = useDbQuery(getDefaultRest, []);
  const [restSheet, setRestSheet] = useState(false);
  const { user, logout } = useAuth();
  const [inviteSheet, setInviteSheet] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function runImport(file: File) {
    setImporting(true);
    try {
      const r = await importFile({ name: file.name, text: await file.text() }, (done, total) =>
        setImportMsg(`Importing… ${done}/${total}`),
      );
      setImportMsg(
        `Imported ${r.workouts} workouts.` +
          (r.newExercises.length ? ` Created ${r.newExercises.length} new exercises.` : '') +
          (r.removed ? ` Removed ${r.removed} duplicate exercises.` : ''),
      );
    } catch (e) {
      setImportMsg(`Import failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setImporting(false);
    }
  }
  async function runExport() {
    setImporting(true);
    setImportMsg('Exporting…');
    try {
      const url = URL.createObjectURL(new Blob([await exportData()], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), {
        href: url,
        download: `ttp-export-${today()}.json`,
      });
      a.click();
      URL.revokeObjectURL(url);
      setImportMsg('Exported.');
    } catch (e) {
      setImportMsg(`Export failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setImporting(false);
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" />

      <section className="flex flex-col gap-2">
        <SectionTitle>Account</SectionTitle>
        <div className={`${card} overflow-hidden`}>
          <Row icon="check" iconBg="bg-green-600" title="Signed in as" detail={user.username} />
        </div>
        {user.isAdmin && (
          <button className={btn.secondary} onClick={() => setInviteSheet(true)}>
            Invite a friend
          </button>
        )}
        <button
          className={btn.danger}
          onClick={() =>
            confirm('Log out of this device?') &&
            void logout().catch((e: unknown) => setMessage(`Log out failed: ${e}`))
          }
        >
          Log out
        </button>
        {message && <p className="px-1 text-sm text-neutral-300">{message}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle>Workout</SectionTitle>
        <div className={`${card} overflow-hidden`}>
          <Row
            icon="timer"
            iconBg="bg-green-600"
            title="Default rest timer"
            detail={defaultRest === undefined ? '' : formatRest(defaultRest)}
            onClick={() => setRestSheet(true)}
            chevron
          />
        </div>
        <p className="px-1 text-xs text-neutral-500">
          Used by every exercise unless you set its rest timer during a workout.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle>Data</SectionTitle>
        <button className={btn.secondary} disabled={importing} onClick={() => void runExport()}>
          <Icon name="download" className="h-5 w-5 text-green-500" />
          <span>
            Export my workouts <span className="text-neutral-500">(JSON)</span>
          </span>
        </button>
        <button className={btn.secondary} disabled={importing} onClick={() => fileInput.current?.click()}>
          <Icon name="upload" className="h-5 w-5 text-green-500" />
          <span>
            Import workouts <span className="text-neutral-500">(TTP JSON or Hevy CSV)</span>
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void runImport(f);
          }}
        />
        {importMsg && <p className="px-1 text-sm text-neutral-300">{importMsg}</p>}
        <p className="px-1 text-xs text-neutral-500">
          Hevy: Profile → Settings → Export &amp; Import Data → Export. Importing a file again replaces, not duplicates.
          Exercises are matched by name; unknown ones are created.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle>About</SectionTitle>
        <div className={`${card} overflow-hidden`}>
          <Row
            icon="settings"
            iconBg="bg-neutral-600"
            title="Build"
            detail={new Date(__BUILD_TIME__).toLocaleString('en-GB')}
          />
        </div>
        <p className="px-1 text-xs text-neutral-500">
          Trust The Process · Exercise photos: free-exercise-db (public domain) · Icons: Material Symbols
        </p>
      </section>

      {inviteSheet && <InviteSheet onClose={() => setInviteSheet(false)} />}

      {restSheet && (
        <Sheet title="Default rest timer" onClose={() => setRestSheet(false)}>
          <div className="grid grid-cols-3 gap-2 pb-2">
            {REST_OPTIONS.map((s) => (
              <button
                key={s}
                className={`${btn.chip(s === defaultRest)} py-3 text-base`}
                onClick={async () => {
                  await setDefaultRest(s);
                  setRestSheet(false);
                }}
              >
                {formatRest(s)}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
