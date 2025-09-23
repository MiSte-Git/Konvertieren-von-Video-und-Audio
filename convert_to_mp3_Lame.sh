#!/bin/bash

# Zeigt einen pulsierenden Fortschrittsdialog, solange der gegebene Befehl läuft
run_with_progress() {
    local message="$1"
    shift

    "$@" &
    local cmd_pid=$!

    (
        while kill -0 "$cmd_pid" 2>/dev/null; do
            echo "# $message"
            sleep 1
        done
    ) | zenity --progress --title="Fortschritt" --text="$message" --pulsate --auto-close --no-cancel

    wait "$cmd_pid"
    return $?
}

choice=$(zenity --list \
    --title="Konvertierungsart auswählen" \
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

case "$choice" in
    "Video zu MP3 (ffmpeg + LAME)")
        file_filter="*.mp4 *.m4a *.avi *.mkv"
        dialog_title="Wähle eine Videodatei"
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
        dialog_title="Wähle eine Audiodatei"
        input=$(zenity --file-selection --title="$dialog_title" --file-filter="$file_filter")

        if [ -z "$input" ]; then
            exit 0
        fi

        output_file="${input%.*}_LAME.mp3"
        run_with_progress "Konvertiere Audio zu MP3 ..." lame -b 192 --cbr --id3v2-only "$input" "$output_file"
        conversion_status=$?
        ;;
    "Video mit DivX zu AVI (Panasonic TV)")
        file_filter="*.mp4 *.m4a *.avi *.mkv"
        dialog_title="Wähle eine Videodatei (Panasonic TV)"
        input=$(zenity --file-selection --title="$dialog_title" --file-filter="$file_filter")

        if [ -z "$input" ]; then
            exit 0
        fi

        if [ ! -f "$input" ]; then
            zenity --error --text="Eingabedatei nicht gefunden: $input"
            exit 1
        fi

        output_file="${input%.*}_DivX.avi"
        run_with_progress "Konvertiere Video zu AVI ..." ffmpeg -i "$input" -c:v libxvid -q:v 5 -r 24 -c:a mp3 -b:a 128k -ac 2 -metadata title="film" "$output_file"
        conversion_status=$?
        ;;
    *)
        zenity --error --text="Unbekannte Option ausgewählt!"
        exit 1
        ;;
esac

if [ $conversion_status -eq 0 ]; then
    zenity --info --text="Konvertierung abgeschlossen: $output_file"
else
    zenity --error --text="Fehler bei der Konvertierung!"
fi
