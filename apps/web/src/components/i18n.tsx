"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { AppLocale } from "@/lib/locale";

export type { AppLocale } from "@/lib/locale";

const STORAGE_KEY = "healthtracker-language";

const german: Record<string, string> = {
  "Health tracker": "Health tracker",
  Overview: "Übersicht",
  Timeline: "Zeitleiste",
  Calendar: "Kalender",
  "Health episodes": "Episoden",
  Documents: "Dokumente",
  Vaccinations: "Impfungen",
  "Medical Providers": "Ärzte & Praxen",
  Reminders: "Erinnerungen",
  Settings: "Einstellungen",
  "Sign out": "Abmelden",
  "Sign in": "Anmelden",
  "Signing in…": "Anmeldung…",
  "Email address": "E-Mail-Adresse",
  Password: "Passwort",
  "Skip to content": "Zum Inhalt springen",
  "Main navigation": "Hauptnavigation",
  "Open navigation": "Navigation öffnen",
  "Close navigation": "Navigation schließen",
  "Active health profile": "Aktives Gesundheitsprofil",
  "Both profiles": "Beide Profile",
  "All profiles": "Alle Profile",
  "Unable to open your workspace":
    "Arbeitsbereich konnte nicht geöffnet werden",
  "Opening your workspace…": "Arbeitsbereich wird geöffnet…",
  "Return to sign in": "Zur Anmeldung zurückkehren",
  "No health profiles are available. Contact the workspace owner.":
    "Keine Gesundheitsprofile verfügbar. Wenden Sie sich an den Eigentümer des Arbeitsbereichs.",
  "Could not sign out. Please try again.":
    "Abmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.",
  "Access is unavailable. Ask the workspace owner to check your account approval, or sign in again.":
    "Der Zugriff ist nicht verfügbar. Bitten Sie den Eigentümer des Arbeitsbereichs, Ihre Freigabe zu prüfen, oder melden Sie sich erneut an.",
  "Unable to sign in. Check your details and try again.":
    "Anmeldung fehlgeschlagen. Prüfen Sie Ihre Angaben und versuchen Sie es erneut.",
  "Unable to verify access.": "Zugriff konnte nicht überprüft werden.",
  "Unable to connect. Please try again.":
    "Verbindung fehlgeschlagen. Bitte versuchen Sie es erneut.",
  "Sign-in is not configured yet. Follow the project README to connect your private workspace.":
    "Die Anmeldung ist noch nicht eingerichtet. Folgen Sie der Projekt-README, um Ihren privaten Arbeitsbereich zu verbinden.",

  "Add event": "Ereignis hinzufügen",
  "Add episode": "Episode hinzufügen",
  "Add document": "Dokument hinzufügen",
  "Add provider": "Einrichtung hinzufügen",
  "Add reminder": "Erinnerung hinzufügen",
  "Add test type": "Untersuchungsart hinzufügen",
  "Add type": "Typ hinzufügen",
  "Add an event first": "Fügen Sie zuerst ein Ereignis hinzu",
  Add: "Hinzufügen",
  Edit: "Bearbeiten",
  Delete: "Löschen",
  Remove: "Entfernen",
  Save: "Speichern",
  Cancel: "Abbrechen",
  Done: "Fertig",
  Retry: "Erneut versuchen",
  Restore: "Wiederherstellen",
  Complete: "Erledigen",
  Open: "Öffnen",
  Download: "Herunterladen",
  "Downloading…": "Wird heruntergeladen…",
  "Saving…": "Wird gespeichert…",
  "Deleting…": "Wird gelöscht…",
  "Uploading…": "Wird hochgeladen…",
  "Importing…": "Wird importiert…",
  "Working…": "In Bearbeitung…",
  "Loading…": "Wird geladen…",
  "Opening…": "Wird geöffnet…",
  "Updating search…": "Suche wird aktualisiert…",
  "Try again": "Erneut versuchen",
  "Discard changes": "Änderungen verwerfen",
  "Discard your changes?": "Änderungen verwerfen?",
  "Unsaved changes": "Ungespeicherte Änderungen",
  "Your unsaved entries will be lost.":
    "Ihre ungespeicherten Eingaben gehen verloren.",

  "Basic information": "Grundinformationen",
  "Additional information": "Zusätzliche Informationen",
  "Medical information": "Medizinische Informationen",
  "Visit details": "Besuchsdetails",
  "Illness details": "Krankheitsdetails",
  "Injury details": "Verletzungsdetails",
  "Symptom details": "Symptomdetails",
  "Migraine details": "Migränedetails",
  "Test details": "Untersuchungsdetails",
  "Vaccination details": "Impfdetails",
  "Event details": "Ereignisdetails",
  Details: "Details",
  "Episode information": "Episodeninformationen",
  "Related events": "Zugehörige Ereignisse",
  "Related documents": "Zugehörige Dokumente",
  "Contact & details": "Kontakt und Details",
  "Health profile": "Gesundheitsprofil",
  Profile: "Profil",
  Profiles: "Profile",
  "Event type": "Ereignistyp",
  "Entry type": "Eintragstyp",
  "Health event": "Gesundheitsereignis",
  "Health events": "Gesundheitsereignisse",
  "Health episode": "Gesundheitsepisode",
  Episode: "Episode",
  Episodes: "Episoden",
  "Episode details": "Episodendetails",
  "Episode profile": "Episodenprofil",
  "Event notes": "Ereignisnotizen",
  "Event tags": "Ereignis-Tags",
  "Event types": "Ereignistypen",
  "Date and time": "Datum und Uhrzeit",
  Date: "Datum",
  Time: "Uhrzeit",
  "End date": "Enddatum",
  "Start date": "Startdatum",
  Started: "Beginn",
  Until: "Bis",
  From: "Von",
  Through: "Bis",
  "From date": "Von Datum",
  "To date": "Bis Datum",
  Today: "Heute",
  Title: "Titel",
  Description: "Beschreibung",
  Notes: "Notizen",
  Tags: "Tags",
  Status: "Status",
  Name: "Name",
  "Display name": "Anzeigename",
  Address: "Adresse",
  Phone: "Telefon",
  Email: "E-Mail",
  Website: "Webseite",
  Specialty: "Fachgebiet",
  Rating: "Bewertung",
  Location: "Ort",
  Doctor: "Arzt/Ärztin",
  "Medical provider": "Medizinische Einrichtung",
  "Medical provider / facility": "Medizinische Einrichtung / Praxis",
  "Healthcare provider": "Medizinische Einrichtung",
  "Previously selected provider": "Zuvor ausgewählte Einrichtung",
  "Unnamed provider": "Unbenannte Einrichtung",

  "Doctor Visit": "Arztbesuch",
  Illness: "Krankheit",
  "Examination / Test": "Untersuchung / Test",
  Injury: "Verletzung",
  Symptom: "Symptom",
  Migraine: "Migräne",
  Other: "Sonstiges",
  Medication: "Medikament",
  Vaccination: "Impfung",
  "Tests & examinations": "Tests und Untersuchungen",
  "Doctor's letter": "Arztbrief",
  "Lab result": "Laborergebnis",
  Invoice: "Rechnung",
  Insurance: "Versicherung",
  "Vaccination certificate": "Impfbescheinigung",
  "Blood test": "Bluttest",
  "Physical examination": "Körperliche Untersuchung",
  Ultrasound: "Ultraschall",
  EKG: "EKG",

  Active: "Aktiv",
  Resolved: "Abgeschlossen",
  Scheduled: "Geplant",
  Completed: "Erledigt",
  Dismissed: "Ausgeblendet",
  "Up to date": "Aktuell",
  Mild: "Leicht",
  Moderate: "Mittel",
  Severe: "Schwer",
  Once: "Einmalig",
  Occasional: "Gelegentlich",
  Frequent: "Häufig",
  Constant: "Ständig",
  Yes: "Ja",
  No: "Nein",
  None: "Keine",
  Monthly: "Monatlich",
  Yearly: "Jährlich",
  "Does not repeat": "Keine Wiederholung",

  Severity: "Schweregrad",
  Frequency: "Häufigkeit",
  Symptoms: "Symptome",
  "Related symptom": "Zugehöriges Symptom",
  "Related doctor visits": "Zugehörige Arztbesuche",
  "Select symptom": "Symptom auswählen",
  "Search symptoms…": "Symptome suchen…",
  "Loading symptoms…": "Symptome werden geladen…",
  "No linked symptom": "Kein verknüpftes Symptom",
  "No symptom events found.": "Keine Symptom-Ereignisse gefunden.",
  "Other Symptoms": "Weitere Symptome",
  "Other symptoms": "Weitere Symptome",
  Diagnosis: "Diagnose",
  Diagnoses: "Diagnosen",
  Treatment: "Behandlung",
  Prescription: "Verschreibung",
  Prescriptions: "Verschreibungen",
  "Medication / treatment": "Medikament / Behandlung",
  "Medication and dose": "Medikament und Dosierung",
  "Possible trigger": "Möglicher Auslöser",
  "Effectiveness / relief": "Wirksamkeit / Linderung",
  Recovery: "Genesung",
  Action: "Maßnahme",
  "Body area": "Körperbereich",
  "Injury type": "Verletzungsart",
  "Cause / how it happened": "Ursache / Hergang",
  "Illness / condition": "Krankheit / Erkrankung",
  "Reason for visit": "Grund des Besuchs",
  "What was done": "Durchgeführte Maßnahmen",
  "What happened": "Was ist passiert",
  "How it felt": "Empfinden",
  "Reason for test": "Grund der Untersuchung",
  "Reason for the test": "Grund der Untersuchung",
  "Results / findings": "Ergebnisse / Befunde",
  "Follow-up / next steps": "Nachsorge / nächste Schritte",
  "Test / examination type": "Test- / Untersuchungsart",
  "Vaccine name": "Impfstoffname",
  "Vaccination record": "Impfeintrag",
  Dose: "Dosis",
  Total: "Gesamt",
  "Total doses": "Gesamtdosen",
  "Administered dose": "Verabreichte Dosis",
  "Next recommended dose": "Nächste empfohlene Dosis",
  "Needs to be renewed?": "Auffrischung erforderlich?",
  "Renewal date": "Auffrischungsdatum",

  Document: "Dokument",
  "Document type": "Dokumenttyp",
  "File type": "Dateityp",
  "Upload file": "Datei hochladen",
  "Upload document": "Dokument hochladen",
  "Choose file": "Datei auswählen",
  "Choose a document.": "Wählen Sie ein Dokument aus.",
  "Select document": "Dokument auswählen",
  "Related event": "Zugehöriges Ereignis",
  "Choose an event": "Ereignis auswählen",
  "Choose a related event.": "Wählen Sie ein zugehöriges Ereignis aus.",
  "No documents": "Keine Dokumente",
  "No documents found": "Keine Dokumente gefunden",
  "No documents for this profile.": "Keine Dokumente für dieses Profil.",
  "No related documents.": "Keine zugehörigen Dokumente.",
  "No related events": "Keine zugehörigen Ereignisse",
  "No related events.": "Keine zugehörigen Ereignisse.",
  "Related events will be kept.": "Zugehörige Ereignisse bleiben erhalten.",
  "This private file could not be opened. Please retry.":
    "Diese private Datei konnte nicht geöffnet werden. Bitte versuchen Sie es erneut.",

  "Active episodes": "Aktive Episoden",
  "Upcoming events": "Anstehende Ereignisse",
  "Recent events": "Letzte Ereignisse",
  "No active episodes.": "Keine aktiven Episoden.",
  "No upcoming events.": "Keine anstehenden Ereignisse.",
  "No recent events.": "Keine letzten Ereignisse.",
  "No reminders.": "Keine Erinnerungen.",
  "No reminders": "Keine Erinnerungen",
  "No episodes.": "Keine Episoden.",
  "No events found": "Keine Ereignisse gefunden",
  "No entries match the current filters.":
    "Keine Einträge entsprechen den aktuellen Filtern.",
  entry: "Eintrag",
  entries: "Einträge",
  "entries · Newest first · Dates in your local timezone":
    "Einträge · Neueste zuerst · Datumsangaben in Ihrer lokalen Zeitzone",
  "entry · Newest first · Dates in your local timezone":
    "Eintrag · Neueste zuerst · Datumsangaben in Ihrer lokalen Zeitzone",
  "No events match your filters on this day.":
    "An diesem Tag entsprechen keine Ereignisse Ihren Filtern.",
  "No health information has been added.":
    "Es wurden noch keine Gesundheitsinformationen hinzugefügt.",
  "No vaccinations recorded": "Keine Impfungen erfasst",
  "No providers": "Keine Einrichtungen",
  "No matching providers": "Keine passenden Einrichtungen",
  "No contact details added yet.": "Noch keine Kontaktdaten hinzugefügt.",
  "Try another name or specialty.":
    "Versuchen Sie einen anderen Namen oder ein anderes Fachgebiet.",

  "All event types": "Alle Ereignistypen",
  "All entries": "Alle Einträge",
  "All events": "Alle Ereignisse",
  "All document types": "Alle Dokumenttypen",
  "All file types": "Alle Dateitypen",
  "All doctors": "Alle Ärzte",
  "All reminders": "Alle Erinnerungen",
  "All statuses": "Alle Status",
  "Search events, symptoms, appointments…":
    "Ereignisse, Symptome, Termine suchen…",
  "Search health events": "Gesundheitsereignisse suchen",
  "Search events": "Ereignisse suchen",
  "Search documents": "Dokumente suchen",
  "Search files and descriptions…": "Dateien und Beschreibungen suchen…",
  "Search filenames and descriptions": "Dateinamen und Beschreibungen suchen",
  "Search reminders": "Erinnerungen suchen",
  "Search reminders…": "Erinnerungen suchen…",
  "Search vaccinations": "Impfungen suchen",
  "Search vaccinations…": "Impfungen suchen…",
  "Search name or specialty…": "Name oder Fachgebiet suchen…",
  "Search tags": "Tags suchen",
  "Search tags…": "Tags suchen…",
  "Search or create…": "Suchen oder erstellen…",
  "Find a provider": "Einrichtung suchen",
  "Clear filters": "Filter zurücksetzen",
  Clear: "Löschen",
  "Clear date": "Datum löschen",
  "Clear event search": "Ereignissuche löschen",
  "Clear document search": "Dokumentsuche löschen",
  "Clear tag search": "Tag-Suche löschen",
  "Show more filters": "Weitere Filter anzeigen",
  "Hide filters": "Filter ausblenden",
  "Previous month": "Vorheriger Monat",
  "Next month": "Nächster Monat",
  "Month view": "Monatsansicht",
  "Filter health events": "Gesundheitsereignisse filtern",
  "Filter documents": "Dokumente filtern",
  "Filter reminders": "Erinnerungen filtern",
  "Filter vaccinations": "Impfungen filtern",
  "No matching tags.": "Keine passenden Tags.",
  "No tags are available.": "Keine Tags verfügbar.",
  "No tags yet. Add your first one above.":
    "Noch keine Tags. Fügen Sie oben den ersten hinzu.",

  "Loading overview…": "Übersicht wird geladen…",
  "Loading timeline…": "Zeitleiste wird geladen…",
  "Loading calendar events…": "Kalenderereignisse werden geladen…",
  "Loading events…": "Ereignisse werden geladen…",
  "Loading event…": "Ereignis wird geladen…",
  "Loading episodes…": "Episoden werden geladen…",
  "Loading documents…": "Dokumente werden geladen…",
  "Loading reminders…": "Erinnerungen werden geladen…",
  "Loading vaccination history…": "Impfhistorie wird geladen…",
  "Loading your medical providers…":
    "Medizinische Einrichtungen werden geladen…",
  "Loading event types…": "Ereignistypen werden geladen…",
  "Loading tags…": "Tags werden geladen…",
  "Loading your labels…": "Bezeichnungen werden geladen…",
  "Gathering related health records…":
    "Zugehörige Gesundheitsdaten werden geladen…",
  "Opening provider details…": "Einrichtungsdetails werden geöffnet…",
  "Opening this health event…": "Gesundheitsereignis wird geöffnet…",
  "Something didn’t load": "Etwas konnte nicht geladen werden",

  "Edit event": "Ereignis bearbeiten",
  "Create event": "Ereignis erstellen",
  "Save changes": "Änderungen speichern",
  "Create and add to Calendar": "Erstellen und zum Kalender hinzufügen",
  "Save and add to Calendar": "Speichern und zum Kalender hinzufügen",
  Import: "Importieren",
  "Import event": "Ereignis importieren",
  "Imported event": "Importiertes Ereignis",
  "Paste valid JSON.": "Fügen Sie gültiges JSON ein.",
  "Choose a health profile.": "Wählen Sie ein Gesundheitsprofil.",
  "Choose an event type.": "Wählen Sie einen Ereignistyp.",
  "Choose an available event type.":
    "Wählen Sie einen verfügbaren Ereignistyp.",
  "Choose a type": "Typ auswählen",
  "Choose a date": "Datum auswählen",
  "Choose date": "Datum auswählen",
  "Add end date": "Enddatum hinzufügen",
  "Select medical provider": "Medizinische Einrichtung auswählen",
  "Select test type": "Untersuchungsart auswählen",
  "Select test types": "Untersuchungsarten auswählen",
  "Choose a test type": "Untersuchungsart auswählen",
  "Enter test type": "Untersuchungsart eingeben",
  "Select severity": "Schweregrad auswählen",
  "Select frequency": "Häufigkeit auswählen",
  "Select…": "Auswählen…",
  "No episode": "Keine Episode",
  "No episodes for this profile": "Keine Episoden für dieses Profil",
  "No events available": "Keine Ereignisse verfügbar",
  "Add recommended dose date": "Datum der empfohlenen Dosis hinzufügen",
  "Add renewal date": "Auffrischungsdatum hinzufügen",
  Reminder: "Erinnerung",
  "Reminder date": "Erinnerungsdatum",
  Repeat: "Wiederholen",
  "Repeat reminder": "Erinnerung wiederholen",
  "Save reminder": "Erinnerung speichern",
  "Complete reminder": "Erinnerung erledigen",
  "Remove reminder": "Erinnerung entfernen",
  "View related event": "Zugehöriges Ereignis anzeigen",

  "Delete event?": "Ereignis löschen?",
  "Delete event": "Ereignis löschen",
  "This event and its documents will be deleted.":
    "Dieses Ereignis und seine Dokumente werden gelöscht.",
  "Delete episode?": "Episode löschen?",
  "Delete episode": "Episode löschen",
  "Delete reminder?": "Erinnerung löschen?",
  "Delete reminder": "Erinnerung löschen",
  "This reminder will be deleted.": "Diese Erinnerung wird gelöscht.",
  "Delete this provider?": "Diese Einrichtung löschen?",
  "Provider deleted. Health events were kept.":
    "Einrichtung gelöscht. Gesundheitsereignisse wurden beibehalten.",
  "Back to timeline": "Zurück zur Zeitleiste",
  "Back to event": "Zurück zum Ereignis",
  "Back to medical providers": "Zurück zu medizinischen Einrichtungen",
  "View timeline": "Zeitleiste anzeigen",
  "View all events": "Alle Ereignisse anzeigen",
  "View calendar": "Kalender anzeigen",
  "View episodes": "Episoden anzeigen",
  "View reminders": "Erinnerungen anzeigen",
  "View all": "Alle anzeigen",
  "Browse timeline": "Zeitleiste durchsuchen",
  "Earlier entries": "Ältere Einträge",
  "Newer entries": "Neuere Einträge",
  "Older records": "Ältere Einträge",
  "Newer records": "Neuere Einträge",
  "Older documents": "Ältere Dokumente",
  "Newer documents": "Neuere Dokumente",
  Older: "Älter",
  Newer: "Neuer",
  "Return to newest entries": "Zu den neuesten Einträgen",
  "Return to newest documents": "Zu den neuesten Dokumenten",

  "Save episode": "Episode speichern",
  "Edit episode": "Episode bearbeiten",
  "Untitled episode": "Unbenannte Episode",
  "No events for this profile.": "Keine Ereignisse für dieses Profil.",
  "Add to your medical providers": "Zu medizinischen Einrichtungen hinzufügen",
  "Edit provider": "Einrichtung bearbeiten",
  "Save provider": "Einrichtung speichern",
  "Provider notes": "Notizen zur Einrichtung",
  "Related appointments": "Zugehörige Termine",
  "Record vaccination": "Impfung erfassen",
  "Record a vaccination": "Impfung erfassen",
  "Change photo": "Foto ändern",
  "Remove photo": "Foto entfernen",
  "Delete photo": "Foto löschen",
  "Save profile": "Profil speichern",
  "Choose a JPG, PNG, or WebP image up to 2 MB.":
    "Wählen Sie ein JPG-, PNG- oder WebP-Bild bis 2 MB.",
  "JPG, PNG, or WebP · Up to 2 MB": "JPG, PNG oder WebP · Bis 2 MB",
  "Your initials will be shown instead. Save the profile to apply this change.":
    "Stattdessen werden Ihre Initialen angezeigt. Speichern Sie das Profil, um die Änderung anzuwenden.",

  "Please check the highlighted fields.":
    "Bitte prüfen Sie die markierten Felder.",
  "Check the selected profile and related records. Linked records must belong to the same health profile.":
    "Prüfen Sie das ausgewählte Profil und die verknüpften Einträge. Verknüpfte Einträge müssen zum selben Gesundheitsprofil gehören.",
  "Enter a title.": "Geben Sie einen Titel ein.",
  "Choose a severity.": "Wählen Sie einen Schweregrad.",
  "Choose a severity from 1 to 5.": "Wählen Sie einen Schweregrad von 1 bis 5.",
  "Choose a frequency.": "Wählen Sie eine Häufigkeit.",
  "Choose up to 20 tags.": "Wählen Sie bis zu 20 Tags.",
  "Use 300 characters or fewer.": "Verwenden Sie höchstens 300 Zeichen.",
  "Use 5,000 characters or fewer.": "Verwenden Sie höchstens 5.000 Zeichen.",
  "End date must be on or after the start date.":
    "Das Enddatum muss am oder nach dem Startdatum liegen.",
  "Unable to complete the request. Please try again.":
    "Die Anfrage konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.",
  "Unable to connect. Check your connection and try again.":
    "Verbindung fehlgeschlagen. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
  "Unable to load events.": "Ereignisse konnten nicht geladen werden.",
  "Unable to load documents.": "Dokumente konnten nicht geladen werden.",
  "Unable to load episodes.": "Episoden konnten nicht geladen werden.",
  "Unable to load this event.": "Dieses Ereignis konnte nicht geladen werden.",
  "Unable to save this event. Your entries have been kept; please try again.":
    "Das Ereignis konnte nicht gespeichert werden. Ihre Eingaben wurden beibehalten; bitte versuchen Sie es erneut.",
  "Unable to upload document.": "Dokument konnte nicht hochgeladen werden.",
  "Unable to open file.": "Datei konnte nicht geöffnet werden.",
  "Unable to download.": "Download fehlgeschlagen.",
  "Unable to load preview.": "Vorschau konnte nicht geladen werden.",
  "Preview unavailable.": "Vorschau nicht verfügbar.",
  "Document uploaded.": "Dokument hochgeladen.",
  "Document upload failed.": "Dokument-Upload fehlgeschlagen.",
  "Event saved.": "Ereignis gespeichert.",
  "Event deleted.": "Ereignis gelöscht.",
  "Episode saved.": "Episode gespeichert.",
  "Episode deleted.": "Episode gelöscht.",
  "Reminder saved.": "Erinnerung gespeichert.",
  "Reminder completed.": "Erinnerung erledigt.",
  "Reminder restored.": "Erinnerung wiederhergestellt.",
  "Reminder deleted.": "Erinnerung gelöscht.",
  "Provider saved.": "Einrichtung gespeichert.",
  "Provider updated.": "Einrichtung aktualisiert.",
  "Profile updated.": "Profil aktualisiert.",
  "Text formatting": "Textformatierung",
  Bold: "Fett",
  Italic: "Kursiv",
  Underline: "Unterstrichen",
  "Bulleted list": "Aufzählung",
  "Numbered list": "Nummerierte Liste",
  Color: "Farbe",
  "Edit type": "Typ bearbeiten",
  "Remove event type?": "Ereignistyp entfernen?",
  "Existing events keep their type and color. It will no longer be available for new events.":
    "Bestehende Ereignisse behalten Typ und Farbe. Für neue Ereignisse ist dieser Typ nicht mehr verfügbar.",
  "Event type saved.": "Ereignistyp gespeichert.",
  "Event type removed.": "Ereignistyp entfernt.",
  "Tag deleted.": "Tag gelöscht.",
  "Tag search results": "Tag-Suchergebnisse",
  "Refresh documents": "Dokumente aktualisieren",
  "Edit document details": "Dokumentdetails bearbeiten",
  "Remove document": "Dokument entfernen",
  "Upload a document above, or clear a filter to see more records.":
    "Laden Sie oben ein Dokument hoch oder setzen Sie einen Filter zurück, um weitere Einträge zu sehen.",
  "Not recorded": "Nicht erfasst",
  "Not set": "Nicht angegeben",
  "None recorded in these events.": "In diesen Ereignissen nicht erfasst.",
};

const english = Object.fromEntries(
  Object.entries(german).map(([source, translated]) => [translated, source]),
);

function translateDynamic(value: string, locale: AppLocale) {
  const rules: Array<[RegExp, (match: RegExpMatchArray) => string]> =
    locale === "de"
      ? [
          [/^(\d+) entries$/, (m) => `${m[1]} Einträge`],
          [/^(\d+) events$/, (m) => `${m[1]} Ereignisse`],
          [/^Uploaded (.+)$/, (m) => `Hochgeladen ${m[1]}`],
          [/^Last updated (.+)$/, (m) => `Zuletzt aktualisiert ${m[1]}`],
          [/^Attached to (.+)$/, (m) => `Verknüpft mit ${m[1]}`],
          [/^Ends (.+)$/, (m) => `Endet ${m[1]}`],
          [/^Create “(.+)”$/, (m) => `„${m[1]}“ erstellen`],
          [/^Edit (.+)$/, (m) => `${m[1]} bearbeiten`],
          [/^Delete (.+)$/, (m) => `${m[1]} löschen`],
          [/^No (.+)\.$/, (m) => `Keine ${m[1]}.`],
        ]
      : [
          [/^(\d+) Einträge$/, (m) => `${m[1]} entries`],
          [/^(\d+) Ereignisse$/, (m) => `${m[1]} events`],
          [/^Hochgeladen (.+)$/, (m) => `Uploaded ${m[1]}`],
          [/^Zuletzt aktualisiert (.+)$/, (m) => `Last updated ${m[1]}`],
          [/^Verknüpft mit (.+)$/, (m) => `Attached to ${m[1]}`],
          [/^Endet (.+)$/, (m) => `Ends ${m[1]}`],
          [/^„(.+)“ erstellen$/, (m) => `Create “${m[1]}”`],
        ];
  for (const [pattern, replace] of rules) {
    const match = value.match(pattern);
    if (match) return replace(match);
  }
  return value;
}

export function translate(value: string, locale: AppLocale) {
  const exact = locale === "de" ? german[value] : english[value];
  return exact ?? translateDynamic(value, locale);
}

function translateNode(node: Node, locale: AppLocale) {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement;
    if (
      !parent ||
      parent.closest("script,style,[data-no-translate],.rich-text-content")
    )
      return;
    const raw = node.textContent ?? "";
    const trimmed = raw.trim();
    if (!trimmed) return;
    const translated = translate(trimmed, locale);
    if (translated !== trimmed)
      node.textContent = raw.replace(trimmed, translated);
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  if (node.matches("script,style,[data-no-translate],.rich-text-content"))
    return;
  for (const attribute of ["placeholder", "title", "aria-label"] as const) {
    const value = node.getAttribute(attribute);
    if (!value) continue;
    const translated = translate(value, locale);
    if (translated !== value) node.setAttribute(attribute, translated);
  }
  node.childNodes.forEach((child) => translateNode(child, locale));
}

type LanguageContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (value: string) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (value) => value,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const initial: AppLocale = saved === "de" ? "de" : "en";
    document.documentElement.lang = initial;
    setLocaleState(initial);
  }, []);

  useEffect(() => {
    translateNode(document.body, locale);
    document.title = translate(document.title, locale);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData")
          translateNode(mutation.target, locale);
        mutation.addedNodes.forEach((node) => translateNode(node, locale));
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [locale]);

  const setLocale = useCallback((next: AppLocale) => {
    document.documentElement.lang = next;
    window.localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  }, []);
  const value = useMemo(
    () => ({ locale, setLocale, t: (text: string) => translate(text, locale) }),
    [locale, setLocale],
  );
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useLanguage();
  return (
    <div
      className={`language-switcher ${compact ? "compact" : ""}`}
      role="group"
      aria-label={locale === "de" ? "Sprache" : "Language"}
      data-no-translate
    >
      <button
        type="button"
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
      >
        EN
      </button>
      <button
        type="button"
        aria-pressed={locale === "de"}
        onClick={() => setLocale("de")}
      >
        DE
      </button>
    </div>
  );
}
