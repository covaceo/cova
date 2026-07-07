import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    build: {
        rollupOptions: {
            output: {
                manualChunks: function (id) {
                    if (id.indexOf("@supabase") >= 0) {
                        return "supabase";
                    }
                    if (id.indexOf("motion") >= 0) {
                        return "motion";
                    }
                    if (id.indexOf("react") >= 0 || id.indexOf("scheduler") >= 0) {
                        return "react-vendor";
                    }
                },
            },
        },
    },
    plugins: [react()],
});
