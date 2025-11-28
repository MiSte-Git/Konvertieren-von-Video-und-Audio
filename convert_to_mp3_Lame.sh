#!/bin/bash

APP_NAME="Konvertierung Audio-Video"
LAST_DURATION=0

# Formatiert Sekunden zu HH:MM:SS
format_duration() {
    local total=${1:-0}
    printf "%02d:%02d:%02d" $(( total / 3600 )) $(( (total % 3600) / 60 )) $(( total % 60 ))
}


# Zeigt einen pulsierenden Fortschrittsdialog, solange der gegebene Befehl läuft
run_with_progress() {
    local message="$1"
    shift

    local start_ts=$(date +%s)

    "$@" &
    local cmd_pid=$!

    (
        while kill -0 "$cmd_pid" 2>/dev/null; do
            local now=$(date +%s)
            local elapsed=$(( now - start_ts ))
            local h=$(( elapsed / 3600 ))
            local m=$(( (elapsed % 3600) / 60 ))
            local s=$(( elapsed % 60 ))
            printf "# %s - Laufzeit: %02d:%02d:%02d\n" "$message" "$h" "$m" "$s"
            sleep 1
        done
    ) | zenity --progress --title="$APP_NAME - Fortschritt" --text="$message" --pulsate --auto-close

    local zenity_status=$?

    if [ $zenity_status -ne 0 ]; then
        # Benutzer hat abgebrochen: Prozess beenden und Kenncode zurückgeben
        kill "$cmd_pid" 2>/dev/null
        wait "$cmd_pid" 2>/dev/null
        local end_ts=$(date +%s)
        LAST_DURATION=$(( end_ts - start_ts ))
        return 130
    fi

    wait "$cmd_pid"
    local end_ts=$(date +%s)
    LAST_DURATION=$(( end_ts - start_ts ))
    return $?
}

choice=$(zenity --list \
    --title="$APP_NAME - Konvertierungsart auswählen" \
    --text="Was möchtest du konvertieren?" \
    --radiolist \
    --column="Auswahl" --column="Option" \
    TRUE "Video zu MP3 (ffmpeg + LAME)" \
    FALSE "Audio zu MP3 (ffmpeg + LAME)" \
    FALSE "Video mit DivX zu AVI (Panasonic TV)")

if [ -z "$choice" ]; then
    exit 0
fi

conversion_status=1
output_file=""
mode=""
log_file=""

case "$choice" in
    "Video zu MP3 (ffmpeg + LAME)")
        file_filter="*.mp4 *.MP4 *.m4a *.M4A *.avi *.AVI *.mkv *.MKV *.mov *.MOV"
        dialog_title="$APP_NAME - Wähle eine Videodatei"
        input=$(zenity --file-selection --title="$dialog_title" --file-filter="$file_filter")

        if [ -z "$input" ]; then
            exit 0
        fi

        output_file="${input%.*}_LAME.mp3"
        run_with_progress "Konvertiere Video zu MP3 ..." bash -c 'set -o pipefail; ffmpeg -i "$1" -vn -ar 44100 -ac 2 -b:a 192k -f wav - | lame -b 192 --cbr --id3v2-only - "$2"' _ "$input" "$output_file"
        conversion_status=$?
        ;;
    "Audio zu MP3 (ffmpeg + LAME)")
        file_filter="*.mp3 *.m4a *.wav"
        dialog_title="$APP_NAME - Wähle eine Audiodatei"
        input=$(zenity --file-selection --title="$dialog_title" --file-filter="$file_filter")

        if [ -z "$input" ]; then
            exit 0
        fi

        output_file="${input%.*}_LAME.mp3"
        run_with_progress "Konvertiere Audio zu MP3 ..." lame -b 192 --cbr --id3v2-only "$input" "$output_file"
        conversion_status=$?
        ;;
    "Video mit DivX zu AVI (Panasonic TV)")
        file_filter="*.mp4 *.MP4 *.m4a *.M4A *.avi *.AVI *.mkv *.MKV *.mov *.MOV"
        dialog_title="$APP_NAME - Wähle eine Videodatei (Panasonic TV)"
        input=$(zenity --file-selection --title="$dialog_title" --file-filter="$file_filter")

        if [ -z "$input" ]; then
            exit 0
        fi

        if [ ! -f "$input" ]; then
            zenity --error --title="$APP_NAME - Fehler" --text="Eingabedatei nicht gefunden: $input"
            exit 1
        fi

        output_file="${input%.*}_DivX.avi"
        log_file="${output_file%.*}.log"
        mode="divx"
        run_with_progress "Konvertiere Video zu AVI ..." bash -c 'set -o pipefail; ffmpeg -y -hwaccel auto -fflags +genpts -i "$1" -map 0:v:0 -map 0:a:0 -sn -dn -c:v mpeg4 -vtag XVID -qscale:v 7 -bf 0 -mbd 0 -g 250 -me_method epzs -pix_fmt yuv420p -threads 0 -vsync 1 -c:a libmp3lame -b:a 128k -ac 2 -ar 44100 -f avi -use_odml 1 -max_interleave_delta 0 -metadata title="film" "$2" 2> "$3"' _ "$input" "$output_file" "$log_file"
        conversion_status=$?
        ;;
    *)
        zenity --error --title="$APP_NAME - Fehler" --text="Unbekannte Option ausgewählt!"
        exit 1
        ;;
esac

if [ $conversion_status -eq 0 ]; then
    # Optional: Dauer prüfen (nur bei DivX, falls ffprobe vorhanden)
    if [ "$mode" = "divx" ] && command -v ffprobe >/dev/null 2>&1; then
        in_dur=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$input" 2>/dev/null)
        out_dur=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$output_file" 2>/dev/null)
        in_s=${in_dur%%.*}
        out_s=${out_dur%%.*}
        if [ -n "$in_s" ] && [ -n "$out_s" ]; then
            diff=$(( in_s - out_s ))
            if [ "$diff" -lt 0 ]; then diff=$(( -diff )); fi
            if [ "$diff" -gt 60 ]; then
                msg="Hinweis: Die Laufzeit der Ausgabedatei unterscheidet sich deutlich.\nOriginal: ${in_s}s, Ausgabe: ${out_s}s.\nEs kann an AVI/Index-Kompatibilität liegen. Die Datei wurde mit OpenDML-Index erstellt.\nLogdatei: ${log_file}"
                zenity --warning --title="$APP_NAME - Hinweis" --text="$msg" || true
            fi
        fi
    fi
    # Abschlussdialog mit Option zum Öffnen des Ausgabeordners
    if zenity --question --title="$APP_NAME - Konvertierung abgeschlossen" --text="Konvertierung abgeschlossen (Dauer: $(format_duration "$LAST_DURATION")):\n$output_file\n\nAusgabeordner öffnen?" --ok-label="Ordner öffnen" --cancel-label="Schließen"; then
        xdg-open "$(dirname "$output_file")" >/dev/null 2>&1 &
    fi
elif [ $conversion_status -eq 130 ]; then
    zenity --warning --title="$APP_NAME - Abgebrochen" --text="Vorgang abgebrochen nach $(format_duration "$LAST_DURATION")."
else
    zenity --error --title="$APP_NAME - Fehler" --text="Fehler bei der Konvertierung! (Dauer: $(format_duration "$LAST_DURATION"))"
fi
