package com.codeshare.backend.controller;

import com.codeshare.backend.model.Room;
import com.codeshare.backend.repository.RoomRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/rooms")
@CrossOrigin(origins = "*")
public class RoomController {

    private final RoomRepository roomRepository;

    @Autowired
    public RoomController(RoomRepository roomRepository) {
        this.roomRepository = roomRepository;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createRoom(@RequestBody Map<String, String> request) {
        String name = request.get("name");
        String password = request.get("password"); // Optional

        if (name == null || name.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Room name is required"));
        }

        String id = UUID.randomUUID().toString();
        // Plaintext password for this simple application/interview demo.
        // For production, you'd BCrypt/hash it.
        Room room = new Room(id, name, password != null && !password.trim().isEmpty() ? password.trim() : null);
        roomRepository.save(room);

        Map<String, Object> response = new HashMap<>();
        response.put("id", room.getId());
        response.put("name", room.getName());
        response.put("passwordProtected", room.getPassword() != null);
        response.put("createdAt", room.getCreatedAt());

        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getRoomInfo(@PathVariable String id) {
        Optional<Room> roomOpt = roomRepository.findById(id);
        if (roomOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Room room = roomOpt.get();
        Map<String, Object> response = new HashMap<>();
        response.put("id", room.getId());
        response.put("name", room.getName());
        response.put("passwordProtected", room.getPassword() != null);
        response.put("language", room.getLanguage());
        response.put("createdAt", room.getCreatedAt());

        return ResponseEntity.ok(response);
    }

    @PostMapping("/{id}/verify")
    public ResponseEntity<Map<String, Object>> verifyPassword(
            @PathVariable String id,
            @RequestBody Map<String, String> request) {

        Optional<Room> roomOpt = roomRepository.findById(id);
        if (roomOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Room room = roomOpt.get();
        if (room.getPassword() == null) {
            return ResponseEntity.ok(Map.of("success", true));
        }

        String inputPassword = request.get("password");
        boolean matches = room.getPassword().equals(inputPassword);

        if (matches) {
            return ResponseEntity.ok(Map.of("success", true));
        } else {
            return ResponseEntity.badRequest().body(Map.of("success", false, "error", "Incorrect password"));
        }
    }
}
