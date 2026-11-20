package ai.nimi.apps.presenton.dev;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.UUID;

/** Saves a completed PC export. It receives document bytes, never Runtime or Host credentials. */
@CapacitorPlugin(name = "PresentonFiles")
public class PresentonFilesPlugin extends Plugin {
    private String id, name, mime;
    private File staged;
    private OutputStream output;
    private long size;
    private boolean choosing;

    @PluginMethod public synchronized void beginExport(PluginCall call) {
        try {
            if (id != null) throw new IllegalStateException("Finish the current export first.");
            String requested = call.getString("name", "");
            if (requested.length() > 180 || !requested.matches("[A-Za-z0-9_-]+\\.(pdf|pptx)")) throw new IllegalArgumentException("Invalid export filename.");
            name = requested;
            mime = requested.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            staged = File.createTempFile("presenton-export-", ".tmp", getContext().getCacheDir());
            output = new FileOutputStream(staged); id = UUID.randomUUID().toString(); size = 0;
            JSObject result = new JSObject(); result.put("id", id); call.resolve(result);
        } catch (Exception error) { call.reject(error.getMessage(), "PRESENTON_EXPORT_UNAVAILABLE"); }
    }

    @PluginMethod public synchronized void appendExport(PluginCall call) {
        try {
            require(call); String data = call.getString("data", "");
            if (choosing || output == null || data.isEmpty() || data.length() > 87384 || !data.matches("[A-Za-z0-9+/]*={0,2}")) throw new IllegalArgumentException("Invalid export chunk.");
            byte[] bytes = Base64.decode(data, Base64.NO_WRAP);
            if (bytes.length > 65536 || size + bytes.length > 1024L * 1024 * 1024) throw new IllegalArgumentException("The export exceeds the device transfer limit of 1 GiB.");
            if (call.getInt("offset", -1) != size) throw new IllegalArgumentException("Export chunks must arrive in order.");
            output.write(bytes); size += bytes.length;
            JSObject result = new JSObject(); result.put("received", size); call.resolve(result);
        } catch (Exception error) { call.reject(error.getMessage(), "PRESENTON_EXPORT_WRITE_FAILED"); }
    }

    @PluginMethod public synchronized void saveExport(PluginCall call) {
        try {
            require(call);
            if (choosing || output == null || size == 0) throw new IllegalStateException("The export is incomplete.");
            output.close(); output = null; choosing = true;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, name);
            startActivityForResult(call, intent, "exportDestination");
        } catch (Exception error) { cleanup(); call.reject(error.getMessage(), "PRESENTON_EXPORT_SAVE_FAILED"); }
    }

    @ActivityCallback private synchronized void exportDestination(PluginCall call, ActivityResult result) {
        if (call == null) { cleanup(); return; }
        try {
            require(call);
            Uri destination = result.getData() == null ? null : result.getData().getData();
            if (result.getResultCode() != Activity.RESULT_OK || destination == null) { cleanup(); call.reject("File saving was canceled.", "PRESENTON_EXPORT_CANCELED"); return; }
            try (FileInputStream input = new FileInputStream(staged); OutputStream target = getContext().getContentResolver().openOutputStream(destination)) {
                if (target == null) throw new IllegalStateException("The selected destination is unavailable.");
                byte[] buffer = new byte[65536]; int count; long copied = 0;
                while ((count = input.read(buffer)) != -1) { target.write(buffer, 0, count); copied += count; }
                if (copied != size) throw new IllegalStateException("The staged export is incomplete.");
            }
            JSObject saved = new JSObject(); saved.put("bytesWritten", size); saved.put("name", name); cleanup(); call.resolve(saved);
        } catch (Exception error) { cleanup(); call.reject("The file was not completely saved. Check the selected destination.", "PRESENTON_EXPORT_SAVE_FAILED"); }
    }

    @PluginMethod public synchronized void abortExport(PluginCall call) {
        if (id != null && id.equals(call.getString("id")) && !choosing) cleanup();
        call.resolve();
    }
    private void require(PluginCall call) {
        if (id == null || !id.equals(call.getString("id"))) throw new IllegalArgumentException("Unknown export transfer.");
    }
    private void cleanup() {
        try { if (output != null) output.close(); } catch (Exception ignored) { }
        if (staged != null) staged.delete();
        output = null; staged = null; id = null; name = null; mime = null; choosing = false; size = 0;
    }
    @Override protected synchronized void handleOnDestroy() { cleanup(); }
}
