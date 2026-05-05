'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Settings, UserCircle, Check, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { User } from '@/types';

interface SettingsViewProps {
  onClose: () => void;
  currentUser?: User | null;
  debugMode?: boolean;
  onDebugModeChange?: (enabled: boolean) => void;
}

export function SettingsView({ onClose, currentUser, debugMode, onDebugModeChange }: SettingsViewProps) {
  const [preferredLanguage, setPreferredLanguage] = useState<string>(currentUser?.preferredLanguage || 'en');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const LANGUAGES = [
    { value: 'en', label: 'English', flag: '🇺🇸' },
    { value: 'ja', label: '日本語', flag: '🇯🇵' },
    { value: 'es', label: 'Español', flag: '🇪🇸' },
    { value: 'fr', label: 'Français', flag: '🇫🇷' },
    { value: 'ru', label: 'Русский', flag: '🇷🇺' },
    { value: 'de', label: 'Deutsch', flag: '🇩🇪' },
    { value: 'zh', label: '中文', flag: '🇨🇳' },
  ];

  const handleSave = useCallback(async () => {
    if (!currentUser?.id) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/users/${currentUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredLanguage }),
      });
      if (response.ok) {
        setSaved(true);
        setTimeout(() => {
          setSaved(false);
          onClose();
        }, 800);
      } else {
        setSaved(false);
      }
    } catch (error) {
      console.error('Failed to update language:', error);
    } finally {
      setSaving(false);
    }
  }, [currentUser?.id, preferredLanguage, onClose]);

  useEffect(() => {
    if (currentUser?.preferredLanguage) {
      setPreferredLanguage(currentUser.preferredLanguage);
    }
  }, [currentUser?.preferredLanguage]);

  return (
    <div className="w-full max-w-md mx-auto animate-in fade-in zoom-in duration-300">
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="p-8 space-y-8">
          <header className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <Settings className="text-gray-500" size={20} />
            </button>
          </header>

          {/* Language Selection */}
          <div className="space-y-4">
            <label className="block text-sm font-semibold text-gray-700 ml-1">
              Preferred Language
            </label>
            <div className="grid grid-cols-2 gap-3">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => setPreferredLanguage(lang.value)}
                  className={cn(
                    "px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 border",
                    preferredLanguage === lang.value
                      ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100"
                      : "bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50"
                  )}
                >
                  <span className="mr-2">{lang.flag}</span>
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* Debug Mode Toggle */}
          {onDebugModeChange && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-gray-700">
                  Debug Mode
                </label>
                <button
                  onClick={() => onDebugModeChange(!debugMode)}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    debugMode ? "bg-blue-600" : "bg-gray-300"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      debugMode ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
              <p className="text-xs text-gray-500">
                {debugMode
                  ? 'Shows original message text and all translations in a collapsible section.'
                  : 'Messages show the translation. Toggle to see raw message data.'}
              </p>
            </div>
          )}

          {/* Current User Info */}
          {currentUser && (
            <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-2xl">
              <div className="h-14 w-14 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                <UserCircle size={32} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">{currentUser.name || currentUser.username}</h3>
                <p className="text-xs text-blue-600 font-medium uppercase tracking-wider">
                  {currentUser.preferredLanguage} speaker
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "w-full py-4 rounded-2xl font-bold text-lg transition-all shadow-lg shadow-blue-200/50 hover:shadow-xl hover:shadow-blue-300/60 active:scale-[0.99] flex items-center justify-center gap-3",
              saved
                ? "bg-green-600 text-white shadow-green-200/50"
                : "bg-blue-600 text-white hover:bg-blue-700"
            )}
          >
            {saved ? (
              <>
                <Check size={20} strokeWidth={3} />
                Saved!
              </>
            ) : (
              <>
                <Save size={18} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}


