package com.codeshare.backend.repository;

import com.codeshare.backend.model.SharedFile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SharedFileRepository extends JpaRepository<SharedFile, String> {
    List<SharedFile> findByRoomId(String roomId);
}
