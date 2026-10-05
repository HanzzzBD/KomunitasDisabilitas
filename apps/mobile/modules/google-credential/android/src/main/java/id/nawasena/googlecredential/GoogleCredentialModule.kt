// Sign in with Google lewat Android Credential Manager (PR-090).
//
// Satu fungsi, satu keluaran: Google ID token. Tidak ada email, nama, atau foto
// yang dikembalikan ke JavaScript, dan TIDAK ADA log sama sekali — identitas
// pengguna baru dipercaya setelah server memverifikasi token itu, jadi
// membacanya di sini hanya membuka jalan bocor ke logcat.
package id.nawasena.googlecredential

import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Kode galat adalah kontrak dengan src/auth/google-credential.ts — ubah keduanya bersamaan.
private const val DIBATALKAN = "DIBATALKAN"
private const val TIDAK_ADA_AKUN = "TIDAK_ADA_AKUN"
private const val GAGAL = "GAGAL"

class GoogleCredentialModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NawasenaGoogleCredential")

    // `GetSignInWithGoogleOption`, bukan `GetGoogleIdOption`: ini alur TOMBOL
    // ("Masuk dengan Google" ditekan pengguna), yang selalu menampilkan pemilih
    // akun dan tidak diam-diam memilihkan akun — penting bagi pengguna pembaca
    // layar yang harus tahu akun mana yang sedang dipakai.
    AsyncFunction("masuk") Coroutine { serverClientId: String, nonce: String ->
      val activity = appContext.currentActivity
        ?: throw CodedException(GAGAL, "Aplikasi belum siap", null)

      val opsi = GetSignInWithGoogleOption.Builder(serverClientId).setNonce(nonce).build()
      val permintaan = GetCredentialRequest.Builder().addCredentialOption(opsi).build()

      val hasil = try {
        CredentialManager.create(activity).getCredential(activity, permintaan)
      } catch (e: GetCredentialCancellationException) {
        throw CodedException(DIBATALKAN, "Dibatalkan pengguna", null)
      } catch (e: NoCredentialException) {
        throw CodedException(TIDAK_ADA_AKUN, "Tidak ada akun Google di perangkat", null)
      } catch (e: GetCredentialException) {
        // `type` menamai JENIS kegagalan (mis. TYPE_UNKNOWN) — aman dibawa;
        // pesan bebasnya tidak, karena isinya tidak kita kendalikan.
        throw CodedException(GAGAL, e.type, null)
      }

      val kredensial = hasil.credential
      if (kredensial !is CustomCredential ||
        kredensial.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
      ) {
        throw CodedException(GAGAL, "Jenis kredensial tidak dikenal", null)
      }

      try {
        GoogleIdTokenCredential.createFrom(kredensial.data).idToken
      } catch (e: GoogleIdTokenParsingException) {
        throw CodedException(GAGAL, "Token Google tidak terbaca", null)
      }
    }
  }
}
