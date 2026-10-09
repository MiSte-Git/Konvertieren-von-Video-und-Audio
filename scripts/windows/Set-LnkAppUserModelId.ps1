# Hilfsfunktion: setzt die AppUserModelID (System.AppUserModel.ID) einer .lnk-Datei.
# Gleiche ID in Verknuepfung und App => Windows ordnet das laufende Fenster der
# Verknuepfung zu, Anheften pinnt die Verknuepfung statt der EXE.
# Verwendung: . "$PSScriptRoot\..\windows\Set-LnkAppUserModelId.ps1"
#             Set-LnkAppUserModelId -Path "C:\...\App.lnk" -AppId "de.michael.konvertierung"

if (-not ("LnkAppUserModelId" -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class LnkAppUserModelId {
  [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
  private class CShellLink {}

  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("0000010b-0000-0000-C000-000000000046")]
  private interface IPersistFile {
    void GetClassID(out Guid pClassID);
    [PreserveSig] int IsDirty();
    void Load([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);
    void Save([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, [MarshalAs(UnmanagedType.Bool)] bool fRemember);
    void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string pszFileName);
    void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string ppszFileName);
  }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  private struct PROPERTYKEY { public Guid fmtid; public uint pid; }

  [StructLayout(LayoutKind.Sequential)]
  private struct PROPVARIANT {
    public ushort vt; public ushort r1; public ushort r2; public ushort r3;
    public IntPtr p; public IntPtr p2;
  }

  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
  private interface IPropertyStore {
    void GetCount(out uint cProps);
    void GetAt(uint iProp, out PROPERTYKEY pkey);
    void GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
    void SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
    void Commit();
  }

  public static void Set(string lnkPath, string appId) {
    var link = new CShellLink();
    try {
      var file = (IPersistFile)link;
      file.Load(lnkPath, 2); // STGM_READWRITE
      var store = (IPropertyStore)link;
      var key = new PROPERTYKEY { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
      var pv = new PROPVARIANT { vt = 31 }; // VT_LPWSTR
      pv.p = Marshal.StringToCoTaskMemUni(appId);
      try {
        store.SetValue(ref key, ref pv);
        store.Commit();
      } finally {
        Marshal.FreeCoTaskMem(pv.p);
      }
      file.Save(lnkPath, true);
    } finally {
      Marshal.ReleaseComObject(link);
    }
  }
}
"@
}

function Set-LnkAppUserModelId {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [Parameter(Mandatory)] [string]$AppId
  )
  [LnkAppUserModelId]::Set((Resolve-Path $Path).Path, $AppId)
}
