"use client";

interface SettingsViewProps {
  role: string;
  setRole: (role: string) => void;
  onBack: () => void;
}

export function SettingsView({ role, setRole, onBack }: SettingsViewProps) {
  const roles = ["student", "teacher"];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Select Your Role</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {roles.map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={`p-6 rounded-lg shadow transition ${
              role === r
                ? "bg-blue-600 text-white"
                : "bg-white hover:bg-gray-50"
            }`}
          >
            <p className="text-lg font-medium capitalize">{r}</p>
            <p className="text-sm opacity-80">
              {r === "student"
                ? "View and send messages as a student"
                : "Translate and send messages as a teacher"}
            </p>
          </button>
        ))}
      </div>

      <button
        onClick={onBack}
        className="text-blue-600 hover:underline"
      >
        Back
      </button>
    </div>
  );
}
