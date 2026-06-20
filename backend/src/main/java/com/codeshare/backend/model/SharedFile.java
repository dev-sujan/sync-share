package com.codeshare.backend.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "shared_files")
public class SharedFile {

    @Id
    private String id;

    @Column(nullable = false)
    private String name;

    private String type;

    private long size;

    @Column(nullable = false)
    private String roomId;

    private LocalDateTime createdAt = LocalDateTime.now();

    public SharedFile() {}

    public SharedFile(String id, String name, String type, long size, String roomId) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.size = size;
        this.roomId = roomId;
        this.createdAt = LocalDateTime.now();
    }

    // Getters and Setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public long getSize() {
        return size;
    }

    public void setSize(long size) {
        this.size = size;
    }

    public String getRoomId() {
        return roomId;
    }

    public void setRoomId(String roomId) {
        this.roomId = roomId;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
