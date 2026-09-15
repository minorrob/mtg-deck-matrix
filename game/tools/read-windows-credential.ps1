param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z0-9_.:-]{1,256}$')]
    [string]$TargetName
)

$ErrorActionPreference = 'Stop'

if (-not ('CrankMagic.NativeCredential' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace CrankMagic {
    public static class NativeCredential {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct CREDENTIAL {
            public UInt32 Flags;
            public UInt32 Type;
            public IntPtr TargetName;
            public IntPtr Comment;
            public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
            public UInt32 CredentialBlobSize;
            public IntPtr CredentialBlob;
            public UInt32 Persist;
            public UInt32 AttributeCount;
            public IntPtr Attributes;
            public IntPtr TargetAlias;
            public IntPtr UserName;
        }

        [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CredRead(string target, UInt32 type, UInt32 reservedFlag, out IntPtr credentialPtr);

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern void CredFree(IntPtr credentialPtr);

        public static byte[] ReadGeneric(string target) {
            IntPtr pointer;
            if (!CredRead(target, 1, 0, out pointer)) {
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            }
            try {
                CREDENTIAL credential = (CREDENTIAL)Marshal.PtrToStructure(pointer, typeof(CREDENTIAL));
                byte[] value = new byte[credential.CredentialBlobSize];
                if (value.Length > 0) Marshal.Copy(credential.CredentialBlob, value, 0, value.Length);
                return value;
            } finally {
                CredFree(pointer);
            }
        }
    }
}
'@
}

$bytes = [CrankMagic.NativeCredential]::ReadGeneric($TargetName)
if (-not $bytes.Length) { throw 'Credential has no secret value.' }
$unicodeLike = ($bytes.Length % 2 -eq 0)
if ($unicodeLike) {
    for ($i = 1; $i -lt $bytes.Length; $i += 2) {
        if ($bytes[$i] -ne 0) { $unicodeLike = $false; break }
    }
}
$secret = if ($unicodeLike) {
    [Text.Encoding]::Unicode.GetString($bytes)
} else {
    [Text.Encoding]::UTF8.GetString($bytes)
}
$secret = $secret.Trim([char]0).Trim()
if (-not $secret) { throw 'Credential has no secret value.' }
Write-Output -NoEnumerate $secret
