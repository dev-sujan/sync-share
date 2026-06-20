package com.codeshare.backend.controller;

import com.codeshare.backend.model.SharedFile;
import com.codeshare.backend.repository.SharedFileRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.*;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/files")
@CrossOrigin(origins = "*")
public class FileController {

    private final SharedFileRepository fileRepository;
    private final Path fileStorageLocation = Paths.get("uploads").toAbsolutePath().normalize();

    @Autowired
    public FileController(SharedFileRepository fileRepository) {
        this.fileRepository = fileRepository;
    }

    @PostConstruct
    public void init() {
        try {
            Files.createDirectories(this.fileStorageLocation);
        } catch (Exception ex) {
            throw new RuntimeException("Could not create the directory where the uploaded files will be stored.", ex);
        }
    }

    @PostMapping("/upload")
    public ResponseEntity<SharedFile> uploadFile(
            @RequestParam("file") MultipartFile file,
            @RequestParam("roomId") String roomId) {

        String fileName = StringUtils.cleanPath(file.getOriginalFilename());

        try {
            // Check if the file's name contains invalid characters
            if (fileName.contains("..")) {
                return ResponseEntity.badRequest().build();
            }

            String fileId = UUID.randomUUID().toString();
            String targetFileName = fileId + "_" + fileName;
            Path targetLocation = this.fileStorageLocation.resolve(targetFileName);
            Files.copy(file.getInputStream(), targetLocation, StandardCopyOption.REPLACE_EXISTING);

            SharedFile sharedFile = new SharedFile(
                    fileId,
                    fileName,
                    file.getContentType(),
                    file.getSize(),
                    roomId
            );
            SharedFile savedFile = fileRepository.save(sharedFile);

            return ResponseEntity.ok(savedFile);
        } catch (IOException ex) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/room/{roomId}")
    public ResponseEntity<List<SharedFile>> getFilesForRoom(@PathVariable String roomId) {
        List<SharedFile> files = fileRepository.findByRoomId(roomId);
        return ResponseEntity.ok(files);
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<Resource> downloadFile(@PathVariable String id) {
        SharedFile sharedFile = fileRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("File not found with id " + id));

        try {
            String targetFileName = sharedFile.getId() + "_" + sharedFile.getName();
            Path filePath = this.fileStorageLocation.resolve(targetFileName).normalize();
            Resource resource = new UrlResource(filePath.toUri());

            if (resource.exists()) {
                return ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(sharedFile.getType() != null ? sharedFile.getType() : "application/octet-stream"))
                        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + sharedFile.getName() + "\"")
                        .body(resource);
            } else {
                return ResponseEntity.notFound().build();
            }
        } catch (MalformedURLException ex) {
            return ResponseEntity.internalServerError().build();
        }
    }

    // Helper static class to clean file path (since we don't have spring's standard StringUtils in all package paths or just to be safe)
    private static class StringUtils {
        public static String cleanPath(String path) {
            if (path == null) return null;
            return Paths.get(path).getFileName().toString();
        }
    }
}
